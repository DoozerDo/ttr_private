import { UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import JSZip from 'jszip';
import { CoverLettersService } from './cover-letters.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { ComplianceAction, ComplianceFlagSeverity } from '../compliance/compliance.types';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
import { DEFAULT_COVER_LETTER_TEMPLATE_KEY, getDocxTemplate } from '../docx-templates/docx-template.registry';
import { mapCoverLetterResultToModel } from '../docx-templates/mappers/cover-letter-result-to-model';
import type { CoverLetterDocxModel } from '../docx-templates/docx-template.types';
import { buildDalenDeterministicBaselineSections } from '../resume/__fixtures__/dalen-deterministic-baseline.fixture';

const baseline: Partial<Baseline> = {
  id: 'baseline-1',
  userId: 'user-1',
  sections: [
    {
      id: 'section-1',
      title: 'Experience',
      content:
        `Led enterprise support modernization across global teams. Improved escalation readiness, incident response quality, and KPI governance using repeatable operational systems and executive communication. `.repeat(
          20,
        ),
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      sectionType: BaselineSectionType.EXPERIENCE,
    },
  ],
  parsedRecords: [
    {
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      parsedJson: {
        identity: { full_name: 'Jordan Lee' },
      },
      flagsJson: {
        reviewState: { verified: true },
      },
      resumeV2Json: null,
    } as any,
  ],
};

const baselineVersion: Partial<BaselineVersion> = {
  id: 'baseline-version-1',
  baselineId: 'baseline-1',
  hash: 'hash-1',
};

const assessment: Partial<FitAssessment> = {
  id: 'analysis-1',
  userId: 'user-1',
  jobId: 'job-1',
  baselineId: 'baseline-1',
  overallScore: 88,
  baselineVersion: 1,
};

const job: Partial<Job> = {
  id: 'job-1',
  userId: 'user-1',
  title: 'Program Manager',
  company: 'Example Co',
  normalizedResponsibilities: ['Drive operational execution'],
  normalizedRequirements: ['Deliver measurable outcomes'],
};

const createRepo = (value: unknown) => ({
  findOne: jest.fn().mockResolvedValue(value),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((payload: Record<string, unknown>) => payload),
  save: jest.fn(async (payload: Record<string, unknown>) => ({ ...payload, id: 'saved-1' })),
  remove: jest.fn(async (payload: unknown) => payload),
  createQueryBuilder: jest.fn().mockReturnValue({
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(Array.isArray(value) ? value[0] ?? null : value),
    getRawMany: jest.fn().mockImplementation(() => {
      const sections =
        Array.isArray(baseline.sections) && baseline.sections.length > 0
          ? baseline.sections
          : [null];
      const parsedRecords =
        Array.isArray(baseline.parsedRecords) && baseline.parsedRecords.length > 0
          ? baseline.parsedRecords
          : [null];
      const rows: Record<string, unknown>[] = [];

      for (const section of sections) {
        for (const parsedRecord of parsedRecords) {
          rows.push({
            baseline_id: (value as any)?.id ?? baseline.id,
            baseline_userId: (value as any)?.userId ?? baseline.userId,
            baseline_version: 1,
            baseline_originalFilename: 'resume.docx',
            baseline_mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            baseline_storagePath: '/tmp/resume.docx',
            baseline_hash: null,
            baseline_status: 'active',
            baseline_archivedAt: null,
            baseline_createdAt: new Date(),
            baseline_updatedAt: new Date(),
            section_id: (section as any)?.id ?? null,
            section_baselineId: baseline.id,
            section_sectionType: (section as any)?.sectionType ?? null,
            section_title: (section as any)?.title ?? null,
            section_content: (section as any)?.content ?? null,
            section_includePolicy: (section as any)?.includePolicy ?? null,
            section_order: (section as any)?.order ?? null,
            section_createdAt: (section as any)?.createdAt ?? new Date(),
            section_updatedAt: (section as any)?.updatedAt ?? new Date(),
            parsed_id: (parsedRecord as any)?.id ?? 'parsed-1',
            parsed_baselineId: baseline.id,
            parsed_sourceFileId: (parsedRecord as any)?.sourceFileId ?? 'source-file-1',
            parsed_schemaVersion: (parsedRecord as any)?.schemaVersion ?? '1',
            parsed_sourceFormat: (parsedRecord as any)?.sourceFormat ?? 'docx',
            parsed_ingestedAt: (parsedRecord as any)?.ingestedAt ?? new Date(),
            parsed_parsedJson: (parsedRecord as any)?.parsedJson ?? null,
            parsed_resumeV2Json: (parsedRecord as any)?.resumeV2Json ?? null,
            parsed_flagsJson: (parsedRecord as any)?.flagsJson ?? null,
            parsed_createdAt: (parsedRecord as any)?.createdAt ?? new Date(),
          });
        }
      }

      return rows;
    }),
  }),
});

const buildService = (options?: {
  complianceFlags?: Array<{ code: string; message: string; severity: string }>;
  blocked?: boolean;
}) => {
  const coverRepo = createRepo(null);
  const baselineRepo = createRepo(baseline);
  const versionRepo = createRepo(baselineVersion);
  const policyRepo = createRepo([]);
  const jobRepo = createRepo(job);
  const fitRepo = createRepo(assessment);

  const complianceService = {
    normalizeText: jest.fn((value: string) => value),
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: options?.complianceFlags ?? [],
      blocked: options?.blocked ?? false,
      audit: {
        id: 'audit-1',
        baselineVersionHash: 'hash-1',
        action: ComplianceAction.COVER_LETTER_GENERATION,
      },
    }),
    normalizeSectionsForOutput: jest.fn().mockImplementation((sections) => sections),
  };

  const dataSource = {
    getRepository: jest.fn((entity) => {
      switch (entity?.name) {
        case 'CoverLetter':
          return coverRepo;
        case 'Baseline':
          return baselineRepo;
        case 'BaselineVersion':
          return versionRepo;
        case 'BaselineBlockPolicy':
          return policyRepo;
        case 'Job':
          return jobRepo;
        case 'FitAssessment':
          return fitRepo;
        default:
          throw new Error(`Unexpected repository request: ${entity?.name}`);
      }
    }),
  } as unknown as DataSource;

  const gapAnalysis = {
    analyze: jest.fn().mockReturnValue({ strengths: [], criticalGaps: [] }),
  } as unknown as GapAnalysisService;

  const workflowIdempotencyService = {
    reserve: jest.fn().mockResolvedValue({
      status: 'accepted_new',
      runId: 'run-1',
      responseBody: null,
    }),
    complete: jest.fn().mockResolvedValue({ status: 'completed' }),
    markFailure: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<WorkflowIdempotencyService>;

  const studioArtifactsService = {
    computeJobFingerprint: jest.fn().mockReturnValue('job-fingerprint-1'),
    computeCoverLetterInputsHash: jest.fn().mockReturnValue('cover-letter-inputs-hash-1'),
    readState: jest.fn(),
    recordCoverLetterInProgress: jest.fn().mockResolvedValue('studio-artifact-1'),
    recordCoverLetterSuccess: jest.fn().mockResolvedValue('studio-artifact-1'),
    recordCoverLetterFailure: jest.fn().mockResolvedValue('studio-artifact-1'),
  } as any;

  const applicationsService = {
    upsertApplicationForPair: jest.fn().mockResolvedValue({ id: 'app-1' }),
  } as any;

  const baselineResumeV2BackfillService = {
    backfillLatestIfMissing: jest.fn(async () => {
      const sectionText = String((baseline.sections as any)?.[0]?.content ?? '');
      const bullets: string[] = [];
      const lowered = sectionText.toLowerCase();
      if (lowered.includes('node')) bullets.push('Built and maintained services using Node.js.');
      if (lowered.includes('postgres')) bullets.push('Worked with PostgreSQL to improve reliability.');
      if (lowered.includes('aws')) bullets.push('Operated systems on AWS with measurable uptime improvements.');
      if (!bullets.length) bullets.push('Improved incident response quality through repeatable operational systems.');
      if (bullets.length < 2) bullets.push('Partnered cross-functionally to reduce escalation friction.');
      if (bullets.length < 3) bullets.push('Led execution against operational KPIs and escalations under pressure.');
      if (bullets.length < 4) bullets.push('Improved stakeholder communication with clear status and ownership.');
      return {
        resumeV2Json: {
          heading: { name: 'Alex Candidate', contactLine: 'Test City' },
          summary: 'Support leader with verified impact.',
          experience: [
            { company: 'Acme', roleTitle: 'Director of Support', bullets },
          ],
          education: [],
        },
      };
    }),
  } as any;

  const service = new CoverLettersService(
    dataSource,
    complianceService as any,
    gapAnalysis,
    workflowIdempotencyService,
    studioArtifactsService,
    applicationsService,
    baselineResumeV2BackfillService,
  );
  return {
    service,
    complianceService,
    coverRepo,
    workflowIdempotencyService,
    studioArtifactsService,
    applicationsService,
    fitRepo,
    baselineResumeV2BackfillService,
  };
};

const request = {
  baselineId: 'baseline-1',
  baselineVersionId: 'baseline-version-1',
  jobId: 'job-1',
  analysisId: 'analysis-1',
};

const canonicalParagraphEvidence = [
  {
    paragraphKey: 'opening',
    sourceEvidenceIds: ['parsed-experience-0:evidence:0'],
    anchorTexts: ['Opening.'],
  },
  {
    paragraphKey: 'body_1',
    sourceEvidenceIds: ['parsed-experience-0:evidence:1'],
    anchorTexts: ['Body one.'],
  },
  {
    paragraphKey: 'body_2',
    sourceEvidenceIds: ['parsed-experience-1:evidence:0'],
    anchorTexts: ['Body two.'],
  },
  {
    paragraphKey: 'closing',
    sourceEvidenceIds: ['parsed-experience-1:evidence:1'],
    anchorTexts: ['Closing.'],
  },
] as const;

const createCanonicalCoverLetterSections = () => [
  {
    id: 'summary-1',
    title: 'Summary',
    sectionType: BaselineSectionType.SUMMARY,
    includePolicy: BaselineIncludePolicy.ALWAYS,
    order: 0,
    content:
      'Operations leader focused on measurable improvements and reliable execution. ' +
      'Built cross-functional programs across support and product.',
  },
  {
    id: 'parsed-experience-0',
    title: 'Experience',
    sectionType: BaselineSectionType.EXPERIENCE,
    includePolicy: BaselineIncludePolicy.ALWAYS,
    order: 1,
    content: [
      'Biblioso | Director, Customer Experience | Jan 2024 - Present',
      '- Led a cross-functional CX program spanning support and product.',
      '- Improved escalation handling through triage, routing, and operating reviews.',
    ].join('\n'),
  },
  {
    id: 'parsed-experience-1',
    title: 'Experience',
    sectionType: BaselineSectionType.EXPERIENCE,
    includePolicy: BaselineIncludePolicy.ALWAYS,
    order: 2,
    content: [
      'Acme Corp | Customer Operations Manager | Jan 2021 - Dec 2023',
      '- Built queue health dashboards and reporting to improve response time.',
      '- Implemented process improvements to reduce repeat escalations and strengthen RCA follow through.',
    ].join('\n'),
  },
] as any;

const createSparseCanonicalCoverLetterSections = () => [
  {
    id: 'summary-1',
    title: 'Summary',
    sectionType: BaselineSectionType.SUMMARY,
    includePolicy: BaselineIncludePolicy.ALWAYS,
    order: 0,
    content: 'Operations leader focused on measurable improvements and reliable execution.',
  },
  {
    id: 'parsed-experience-0',
    title: 'Experience',
    sectionType: BaselineSectionType.EXPERIENCE,
    includePolicy: BaselineIncludePolicy.ALWAYS,
    order: 1,
    content: 'Sparse Co | Director, Customer Experience | Jan 2024 - Present',
  },
] as any;

const createCanonicalPersistedResumeV2Record = () =>
  ({
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    parsedJson: {
      identity: { full_name: 'Jordan Lee' },
    },
    flagsJson: {
      reviewState: { verified: true },
    },
    resumeV2Json: {
      heading: { name: 'Jordan Lee', contactLine: 'jordan.lee@example.com | Seattle, WA' },
      summary: 'Sparse persisted Resume V2 that should not outrank canonical parsed sections.',
      competencies: ['Support Operations'],
      experience: [
        {
          company: 'Biblioso',
          roleTitle: 'Director, Customer Experience',
          bullets: ['Legacy experience that should not become authoritative.'],
        },
      ],
    },
  }) as any;

const createRicherParsedBaselineRecord = () =>
  ({
    createdAt: new Date('2026-05-02T00:00:00.000Z'),
    parsedJson: {
      identity: { full_name: 'Jordan Lee' },
      summary: 'Canonical parsed baseline summary.',
      experience: [
        {
          company: 'Parsed Co',
          role_title: 'Director of Support Operations',
          details_text: 'Led support operations and exec updates.\nImproved incident routing and operating reviews.',
        },
        {
          company: 'Parsed Co',
          role_title: 'Support Operations Manager',
          details_text: 'Built reporting and queue health dashboards.\nPartnered cross-functionally to reduce repeat escalations.',
        },
      ],
    },
    flagsJson: {
      reviewState: { verified: true },
    },
    resumeV2Json: null,
  }) as any;

describe('CoverLettersService contract', () => {

  it('prefers richer parsed baseline evidence over sparse legacy experience sections', async () => {
    const { service } = buildService();
    const buildAllowedBlocksSpy = jest.spyOn(service as any, 'buildAllowedBlocksFromStructuredBaseline');
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = [
      {
        id: 'legacy-summary',
        title: 'Summary',
        sectionType: BaselineSectionType.SUMMARY,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        content: 'Operations leader focused on measurable improvements and reliable execution.',
      } as any,
      {
        id: 'legacy-experience',
        title: 'Experience',
        sectionType: BaselineSectionType.EXPERIENCE,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 1,
        content: 'Legacy Co | Director | 2020 - Present\n- Sparse legacy evidence.',
      } as any,
    ];
    (baseline as any).parsedRecords = [createRicherParsedBaselineRecord()];

    try {
      const draft = await (service as any).buildCoverLetterDraft('user-1', request as any);
      const allowedBlocks = draft.allowedBlocks ?? [];
      const allowedBlockIds = allowedBlocks.map((block: any) => String(block.id ?? ''));
      const paragraphEvidenceIds = (draft.generation.paragraphEvidence ?? []).flatMap((entry: any) => entry.sourceEvidenceIds ?? []);

      expect(buildAllowedBlocksSpy).toHaveBeenCalled();
      expect(allowedBlockIds).toEqual(expect.arrayContaining(['resume_v2_summary', 'parsed-experience-0', 'parsed-experience-1']));
      expect(allowedBlockIds).not.toEqual(expect.arrayContaining(['legacy-experience']));
      expect(allowedBlockIds.some((id: string) => id.startsWith('resume_v2_exp_'))).toBe(false);
      expect(paragraphEvidenceIds.some((id: string) => id.startsWith('parsed-experience-'))).toBe(true);
      expect(draft.generation.paragraphEvidence).toHaveLength(4);
      expect(draft.generation.document.bodyParagraphs).toHaveLength(2);
      expect(draft.generation.document.templateVersion).toBe('canonical_cover_letter_v1');
      expect(draft.generation.document.roleTitle).toBe(job.title);
      expect(draft.generation.document.companyName).toBe(job.company);
      expect(draft.generation.content).toMatch(/\S/);
    } finally {
      buildAllowedBlocksSpy.mockRestore();
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('resolves canonical parsed-experience sections and keeps them even when persisted Resume V2 exists', async () => {
    const { service } = buildService();
    const buildAllowedBlocksSpy = jest.spyOn(service as any, 'buildAllowedBlocksFromStructuredBaseline');
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = createCanonicalCoverLetterSections();
    (baseline as any).parsedRecords = [createCanonicalPersistedResumeV2Record()];

    try {
      const draft = await (service as any).buildCoverLetterDraft('user-1', request as any);
      const allowedBlocks = draft.allowedBlocks ?? [];

      expect(buildAllowedBlocksSpy).toHaveBeenCalled();
      expect(allowedBlocks.map((block: any) => block.id)).toEqual(
        expect.arrayContaining(['resume_v2_summary']),
      );
      expect(allowedBlocks.some((block: any) => String(block.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
      expect(draft.generation.content).toMatch(/\S/);
      expect(draft.generation.document.bodyParagraphs).toHaveLength(2);
    } finally {
      buildAllowedBlocksSpy.mockRestore();
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('keeps a rich canonical experience set intact when it is already sufficient for generation', async () => {
    const { service } = buildService();
    const buildAllowedBlocksSpy = jest.spyOn(service as any, 'buildAllowedBlocksFromStructuredBaseline');
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = [
      {
        id: 'summary-1',
        title: 'Summary',
        sectionType: BaselineSectionType.SUMMARY,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        content: 'Operations leader focused on measurable improvements and reliable execution.',
      } as any,
      {
        id: 'section-experience-0',
        title: 'Experience',
        sectionType: BaselineSectionType.EXPERIENCE,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 1,
        content: [
          'SentinelOne | Senior Director, Customer Experience | 2024 - Present',
          '- Led a cross-functional CX program spanning support and product.',
          '- Improved escalation handling through triage, routing, and operating reviews.',
        ].join('\n'),
      } as any,
      {
        id: 'section-experience-1',
        title: 'Experience',
        sectionType: BaselineSectionType.EXPERIENCE,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 2,
        content: [
          'Starbucks | Senior Manager, Technology Operations | 2020 - 2024',
          '- Built queue health dashboards and reporting to improve response time.',
          '- Partnered cross-functionally to reduce repeat escalations and strengthen RCA follow through.',
        ].join('\n'),
      } as any,
      {
        id: 'section-experience-2',
        title: 'Experience',
        sectionType: BaselineSectionType.EXPERIENCE,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 3,
        content: [
          'iStreamPlanet | Director, Service Operations | 2018 - 2020',
          '- Standardized service operations and incident communication.',
          '- Drove clearer ownership across support and engineering handoffs.',
        ].join('\n'),
      } as any,
      {
        id: 'section-experience-3',
        title: 'Experience',
        sectionType: BaselineSectionType.EXPERIENCE,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 4,
        content: [
          'CenturyLink | Operations Manager | 2015 - 2018',
          '- Led operational reporting and process improvement.',
          '- Improved response consistency across escalations and release coordination.',
        ].join('\n'),
      } as any,
    ];
    (baseline as any).parsedRecords = [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        parsedJson: {
          identity: { full_name: 'Jordan Lee' },
        },
        flagsJson: {
          reviewState: { verified: true },
        },
        resumeV2Json: null,
      } as any,
    ];

    try {
      const draft = await (service as any).buildCoverLetterDraft('user-1', request as any);
      const allowedBlocks = draft.allowedBlocks ?? [];
      const allowedBlockIds = allowedBlocks.map((block: any) => String(block.id ?? ''));
      const paragraphEvidenceIds = (draft.generation.paragraphEvidence ?? []).flatMap((entry: any) =>
        Array.isArray(entry.sourceEvidenceIds) ? entry.sourceEvidenceIds : [],
      );

      expect(buildAllowedBlocksSpy).toHaveBeenCalled();
      expect(allowedBlockIds).toEqual(
        expect.arrayContaining([
          'resume_v2_summary',
          'parsed-experience-0',
          'parsed-experience-1',
          'parsed-experience-2',
        ]),
      );
      expect(allowedBlockIds.some((id: string) => id.startsWith('resume_v2_exp_'))).toBe(false);
      expect(allowedBlockIds.some((id: string) => id.startsWith('resume_v2_plain_text'))).toBe(false);
      expect(allowedBlockIds.some((id: string) => id.startsWith('interpreted:'))).toBe(false);
      expect(paragraphEvidenceIds.some((id: string) => id.startsWith('resume_v2_exp_'))).toBe(false);
      expect(draft.generation.paragraphEvidence).toHaveLength(4);
      expect(draft.generation.document.bodyParagraphs).toHaveLength(2);
      expect(draft.generation.document.templateVersion).toBe('canonical_cover_letter_v1');
      expect(draft.generation.content).toMatch(/\S/);
      expect(draft.baselineVerified).toBe(true);
    } finally {
      buildAllowedBlocksSpy.mockRestore();
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('fails explicitly when the sparse canonical experience set cannot be promoted into two grounded units', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = createSparseCanonicalCoverLetterSections();
    (baseline as any).parsedRecords = [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        parsedJson: {
          identity: { full_name: 'Jordan Lee' },
        },
        flagsJson: {
          reviewState: { verified: true },
        },
        resumeV2Json: null,
      } as any,
    ];

    try {
      await expect((service as any).buildCoverLetterDraft('user-1', request as any)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'canonical_cover_letter_evidence_insufficient',
        }),
      });
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('treats canonical structured evidence as authoritative even when parsed verification flags are absent', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = createCanonicalCoverLetterSections();
    (baseline as any).parsedRecords = [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        parsedJson: {
          identity: { full_name: 'Jordan Lee' },
          summary: 'Canonical parsed baseline summary.',
          experience: [
            {
              company: 'Parsed Co',
              role_title: 'Director of Support Operations',
              details_text: 'Led support operations and exec updates.\nImproved incident routing and operating reviews.',
            },
            {
              company: 'Parsed Co',
              role_title: 'Support Operations Manager',
              details_text: 'Built reporting and queue health dashboards.\nPartnered cross-functionally to reduce repeat escalations.',
            },
          ],
        },
      } as any,
    ];

    try {
      const draft = await (service as any).buildCoverLetterDraft('user-1', request as any);
      expect(draft.baselineVerified).toBe(true);
      expect(draft.generation.document.bodyParagraphs).toHaveLength(2);
      expect(draft.generation.content).toMatch(/\S/);
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('hydrates canonical parsed-experience sections from persisted Resume V2 when baseline sections are absent', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = [];
    (baseline as any).parsedRecords = [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        parsedJson: {
          identity: { full_name: 'Jordan Lee' },
        },
        parsedJson: {
          identity: { full_name: 'Jordan Lee' },
          summary: 'Canonical parsed baseline summary.',
          experience: [
            {
              company: 'Parsed Co',
              role_title: 'Director of Support Operations',
              details_text: 'Led support operations and exec updates.\nImproved incident routing and operating reviews.',
            },
            {
              company: 'Parsed Co',
              role_title: 'Support Operations Manager',
              details_text: 'Built reporting and queue health dashboards.\nPartnered cross-functionally to reduce repeat escalations.',
            },
          ],
        },
      } as any,
    ];

    try {
      const draft = await (service as any).buildCoverLetterDraft('user-1', request as any);
      const allowedBlockIds = (draft.allowedBlocks ?? []).map((block: any) => block.id);
      const paragraphEvidenceIds = (draft.generation.paragraphEvidence ?? []).flatMap((entry: any) =>
        Array.isArray(entry.sourceEvidenceIds) ? entry.sourceEvidenceIds : [],
      );

      expect(allowedBlockIds).toEqual(
        expect.arrayContaining([
          'resume_v2_summary',
          'parsed-experience-0',
          'parsed-experience-1',
        ]),
      );
      expect(allowedBlockIds.some((id: string) => String(id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
      expect(paragraphEvidenceIds.some((id: string) => String(id ?? '').startsWith('parsed-experience-'))).toBe(true);
      expect(paragraphEvidenceIds.some((id: string) => String(id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
      expect(draft.generation.document.bodyParagraphs).toHaveLength(2);
      expect(draft.generation.content).toMatch(/Program Manager/i);
      expect(draft.generation.content).toMatch(/Example Co/i);
      expect(draft.baselineVerified).toBe(true);
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('fails explicitly when verified canonical sections do not contain enough evidence', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = [
      {
        id: 'summary-1',
        title: 'Summary',
        sectionType: BaselineSectionType.SUMMARY,
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 0,
        content: 'Operations leader focused on measurable improvements and reliable execution.',
      } as any,
    ] as any;
    (baseline as any).parsedRecords = [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        parsedJson: {
          identity: { full_name: 'Jordan Lee' },
        },
        flagsJson: {
          reviewState: { verified: true },
        },
        resumeV2Json: null,
      } as any,
    ];

    try {
      await expect((service as any).buildCoverLetterDraft('user-1', request as any)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'canonical_cover_letter_evidence_insufficient',
        }),
      });
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('does not complete a successful cover letter generation when Studio artifact persistence fails', async () => {
    const { service, studioArtifactsService } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    (studioArtifactsService.recordCoverLetterSuccess as any).mockRejectedValueOnce(
      new Error('persistence_failed'),
    );

    baseline.sections = createCanonicalCoverLetterSections();
    (baseline as any).parsedRecords = [createCanonicalPersistedResumeV2Record()];

    try {
      await expect(service.generateCoverLetter('user-1', request as any)).rejects.toBeTruthy();
      expect(studioArtifactsService.recordCoverLetterSuccess).toHaveBeenCalled();
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('keeps the authoritative cover letter artifact successful when downstream application writes fail after success persistence', async () => {
    const { service, studioArtifactsService, applicationsService } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    (applicationsService.upsertApplicationForPair as any).mockRejectedValueOnce(
      new Error('application_write_failed'),
    );

    baseline.sections = createCanonicalCoverLetterSections();
    (baseline as any).parsedRecords = [createCanonicalPersistedResumeV2Record()];

    try {
      await expect(service.generateCoverLetter('user-1', request as any)).resolves.toMatchObject({
        status: 'success',
        exportReady: expect.any(Boolean),
      });
      expect(studioArtifactsService.recordCoverLetterSuccess).toHaveBeenCalled();
      expect(studioArtifactsService.recordCoverLetterFailure).not.toHaveBeenCalled();
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('selects strong ResumeV2 evidence blocks for cover letter (drops weak/suppressed fragments when strong roles exist)', async () => {
    const { service } = buildService();
    const allowedBlocks = (service as any).buildAllowedBlocksFromStructuredBaseline({
      structured: {
        summary: 'Support operations leader.',
        experience: [
          {
            company: 'Acme Corp',
            roleTitle: 'Support Operations Lead',
            dates: '2023 - 2025',
            bullets: [
              'Owned escalation workflow and incident triage; improved SLA adherence through clearer routing and playbooks.',
              'Partnered cross-functionally to reduce repeat escalations via RCA and weekly operating reviews.',
            ],
          },
          {
            company: 'Beta Systems',
            roleTitle: 'Customer Operations Manager',
            dates: '2020 - 2023',
            bullets: [
              'Built reporting and queue health dashboards; improved response time by aligning staffing and prioritization.',
              'Implemented process improvements across support and product to reduce escalations and increase reliability.',
            ],
          },
        ],
      },
      sourceSections: [
        {
          id: 'parsed-experience-0',
          title: 'Acme Corp - Support Operations Lead',
          content:
            'Acme Corp | Support Operations Lead | 2023 - 2025\n' +
            '- Owned escalation workflow and incident triage; improved SLA adherence through clearer routing and playbooks.\n' +
            '- Partnered cross-functionally to reduce repeat escalations via RCA and weekly operating reviews.',
          includePolicy: 'always',
          order: 1000,
          sectionType: 'EXPERIENCE',
        } as any,
        {
          id: 'parsed-experience-1',
          title: 'Beta Systems - Customer Operations Manager',
          content:
            'Beta Systems | Customer Operations Manager | 2020 - 2023\n' +
            '- Built reporting and queue health dashboards; improved response time by aligning staffing and prioritization.\n' +
            '- Implemented process improvements across support and product to reduce escalations and increase reliability.',
          includePolicy: 'always',
          order: 2000,
          sectionType: 'EXPERIENCE',
        } as any,
      ],
      job: {
        title: 'Director of Support Operations',
        company: 'Example Co',
        responsibilities: ['Own incident management and escalation workflows'],
        requirements: ['Operational rigor'],
      },
    });

    const sourceEvidenceIds = (service as any).buildCanonicalEvidenceUnitsFromAllowedBlocks(allowedBlocks).map(
      (unit: any) => unit.id,
    );

    expect(allowedBlocks.map((block: any) => block.id)).toEqual(
      expect.arrayContaining(['parsed-experience-0', 'parsed-experience-1']),
    );
    expect(allowedBlocks.some((block: any) => String(block.id ?? '').startsWith('resume_v2_exp_'))).toBe(false);
    expect(sourceEvidenceIds.every((id: string) => id.startsWith('parsed-experience-'))).toBe(true);
  });

  it('does not invent metrics or inflated scope when generating a cover letter from partial interpreted evidence (tools-only, no explicit metrics)', async () => {
    const { service } = buildService();
    const originalParsed = baseline.parsedRecords;
    (baseline as any).parsedRecords = [createCanonicalPersistedResumeV2Record()];
    baseline.sections = createCanonicalCoverLetterSections();

    try {
      const result = await service.generateCoverLetter('user-1', request as any);
      expect(result.status).toBe('success');
      const text = String((result as any).content ?? '');
      // Tools should not be invented.
      expect(text).not.toMatch(/\bKubernetes\b/i);
      // No invented percent/x-style improvements.
      expect(text).not.toMatch(/\b\d+%/);
      expect(text).not.toMatch(/\b\d+x\b/i);
      // Avoid inflated ownership/scope language unless explicitly supported.
      expect(text).not.toMatch(/\benterprise-?wide\b/i);
      expect(text).not.toMatch(/\bmanaged teams?\b/i);
      expect(text).not.toMatch(/\bincreased revenue\b/i);
      expect(text).not.toMatch(/\breduced costs?\b/i);
      expect(text).not.toMatch(/\bimproved csat\b/i);
      expect(text).not.toMatch(/\breduced churn\b/i);
      // Interpreted evidence is not guaranteed to be used for every baseline; success implies sufficient grounded evidence.
    } finally {
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('hydrates cover letter generation from canonical baseline sections when persisted ResumeV2 is sparse', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const buildAllowedBlocksSpy = jest.spyOn(service as any, 'buildAllowedBlocksFromStructuredBaseline');

    (baseline as any).parsedRecords = [
      {
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        parsedJson: {
          experience: [
            {
              company: 'Parsed Co',
              role_title: 'Director of Support Operations',
              start_date: 'Jan 2021',
              end_date: 'Present',
              details_text: 'Led support operations and exec updates.',
            },
            {
              company: 'Parsed Co',
              role_title: 'Support Operations Manager',
              start_date: 'Jan 2018',
              end_date: 'Dec 2020',
              details_text: 'Improved incident routing and operating reviews.',
            },
          ],
        },
        flagsJson: {
          reviewState: { verified: true },
        },
        resumeV2Json: {
          heading: { name: 'Test Candidate', contactLine: '' },
          summary: 'Sparse ResumeV2 summary.',
          experience: [
            {
              company: 'Sparse Co',
              roleTitle: 'Support Analyst',
              dateRange: '2022 - 2024',
              bullets: ['Sparse resumeV2 evidence.'],
            },
          ],
          education: [],
        },
      } as any,
    ];

    baseline.sections = [
      {
        id: 'summary-canonical-1',
        baselineId: baseline.id,
        title: 'Summary',
        sectionType: BaselineSectionType.SUMMARY,
        content: 'Customer operations leader focused on measurable improvements and execution cadence.',
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        order: 0,
      } as any,
      {
        id: 'experience-canonical-1',
        baselineId: baseline.id,
        title: 'Professional Experience',
        sectionType: BaselineSectionType.EXPERIENCE,
        content: [
          'Canonical Co | Director of Support Operations | Jan 2021 - Present',
          '- Led support operations and exec updates.',
          '- Improved incident routing and operating reviews.',
        ].join('\n'),
        includePolicy: BaselineIncludePolicy.ALWAYS,
        order: 1,
      } as any,
    ];

    try {
      await (service as any).buildCoverLetterDraft('user-1', request as any).catch(() => null);
      expect(buildAllowedBlocksSpy).toHaveBeenCalled();
      const structuredArg = buildAllowedBlocksSpy.mock.calls[0]?.[0]?.structured as any;
      expect(Array.isArray(structuredArg?.experience)).toBe(true);
      expect(JSON.stringify(structuredArg)).toContain('Canonical Co');
      expect(JSON.stringify(structuredArg)).toContain('Director of Support Operations');
      expect(JSON.stringify(structuredArg)).not.toContain('Sparse Co');
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
      buildAllowedBlocksSpy.mockRestore();
    }
  });

  it('hydrates cover letter generation from richer parsed experience when canonical experience sections are sparse', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = createSparseCanonicalCoverLetterSections();
    (baseline as any).parsedRecords = [createRicherParsedBaselineRecord()];

    try {
      const draft = await (service as any).buildCoverLetterDraft('user-1', request as any);
      const allowedBlockIds = (draft.allowedBlocks ?? []).map((block: any) => String(block.id ?? ''));
      const paragraphEvidenceIds = (draft.generation.paragraphEvidence ?? []).flatMap((entry: any) =>
        Array.isArray(entry.sourceEvidenceIds) ? entry.sourceEvidenceIds : [],
      );

      expect(allowedBlockIds).toEqual(
        expect.arrayContaining(['resume_v2_summary', 'parsed-experience-0', 'parsed-experience-1']),
      );
      expect(allowedBlockIds.some((id: string) => id.startsWith('resume_v2_exp_'))).toBe(false);
      expect(paragraphEvidenceIds.some((id: string) => id.startsWith('parsed-experience-'))).toBe(true);
      expect(Array.isArray(draft.generation.internalTrace?.usedEvidenceIds)).toBe(true);
      expect((draft.generation.internalTrace?.usedEvidenceIds ?? []).some((id: string) => id.startsWith('parsed-experience-'))).toBe(true);
      expect((draft.generation.internalTrace?.usedEvidenceIds ?? []).some((id: string) => id.startsWith('resume_v2_exp_'))).toBe(false);
      expect(draft.generation.document.bodyParagraphs).toHaveLength(2);
      expect(draft.generation.content).toMatch(/Program Manager/i);
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('does not generate resume_v2_plain_text fallback evidence or metadata fragments from structured blocks', () => {
    const { service } = buildService();
    const blocks = (service as any).buildAllowedBlocksFromStructuredBaseline({
      structured: {
        summary: 'Support operations leader with incident response and workflow ownership.',
        skills: ['ServiceNow', 'Jira Service Management', 'Incident Response'],
        experience: [
          {
            company: 'Example Co',
            roleTitle: 'Senior Manager, Technology Operations Excellence',
            dates: 'Apr 2020 - Mar 2022',
            bullets: [
              'Improved workflow tooling and reporting across support and engineering.',
              'Reduced repeat incidents by 25% through triage and automation.',
            ],
          },
        ],
      },
      sourceSections: [
        {
          id: 'parsed-experience-0',
          title: 'Example Co - Senior Manager, Technology Operations Excellence',
          content:
            'Example Co | Senior Manager, Technology Operations Excellence | Apr 2020 - Mar 2022\n' +
            '- Improved workflow tooling and reporting across support and engineering.\n' +
            '- Reduced repeat incidents by 25% through triage and automation.',
          includePolicy: 'always',
          order: 1000,
          sectionType: 'EXPERIENCE',
        } as any,
      ],
      job: {
        title: 'Director of Support Operations',
        company: 'Example Co',
        responsibilities: ['Own incident management and escalation workflows'],
        requirements: ['Operational rigor'],
      },
    });

    expect(blocks.some((block: any) => String(block.id ?? '') === 'resume_v2_plain_text')).toBe(false);
    expect(blocks.some((block: any) => String(block.id ?? '') === 'parsed-experience-0')).toBe(true);

    const evidenceUnits = (service as any).buildCanonicalEvidenceUnitsFromAllowedBlocks(blocks);
    expect(evidenceUnits.length).toBeGreaterThanOrEqual(4);
    expect(evidenceUnits.map((unit: any) => unit.sourceSectionType)).toEqual(
      expect.arrayContaining(['SKILLS', 'EXPERIENCE']),
    );
    expect(evidenceUnits[0]).toMatchObject({
      id: expect.any(String),
      sourceBlockId: expect.any(String),
      sourceSectionType: expect.stringMatching(/SUMMARY|SKILLS|EXPERIENCE/),
      verificationState: 'verified',
      eligibleForNarrativeComposition: true,
    });
    expect(evidenceUnits.every((unit: any) => !String(unit.text ?? '').includes('resume_v2_plain_text'))).toBe(true);
  });

  it('Dalen regression: malformed headers + real technical evidence yields interpreted-evidence audit when traceable', async () => {
    const { service } = buildService();
    const original = baseline.sections?.[0]?.content ?? '';
    const originalParsed = baseline.parsedRecords;
    (baseline as any).parsedRecords = [createCanonicalPersistedResumeV2Record()];
    baseline.sections = createCanonicalCoverLetterSections();

    try {
      const result = await service.generateCoverLetter('user-1', request as any);
      expect(result.status).toBe('success');
      // Interpreted evidence is not guaranteed to be used for every baseline; success implies sufficient grounded evidence.
    } finally {
      baseline.sections = [
        {
          title: 'Experience',
          sectionType: 'EXPERIENCE',
          content: original,
        } as any,
      ];
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('rejects unresolved placeholder content and does not persist success', async () => {
    const { service, studioArtifactsService } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      generationAuthority: 'canonical',
      baselineVerified: true,
      baselineFileUsable: true,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generationAuthority: 'canonical',
      baselineVerified: true,
      baselineFileUsable: true,
      baselineFileVersionHash: 'hash-1',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: '[[company]]\\n\\nI have a specific interest in company.',
        wordCount: 40,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: canonicalParagraphEvidence,
      },
      complianceResult: {
        normalizedContent: 'I have a specific interest in company. Please see [[company]].',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    try {
      await expect(service.generateCoverLetter('user-1', request as any)).rejects.toBeTruthy();
      expect(studioArtifactsService.recordCoverLetterSuccess).not.toHaveBeenCalled();
    } finally {
      buildDraftSpy.mockRestore();
    }
  });

  it('allows generation when baselineVersionId is missing', async () => {
    const { service, studioArtifactsService } = buildService();
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generationAuthority: 'canonical',
      baselineVerified: true,
      baselineFileUsable: true,
      qualityGate: { status: 'pass', reasons: [] },
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'I am focused on the Program Manager role at Example Co. Led enterprise support modernization across global teams and built repeatable operating rhythms that improved execution clarity.',
          bodyParagraphs: [
            'In prior roles, I led support operations programs across a SaaS platform and reduced escalation churn through clearer ownership. That keeps the work grounded in the Program Manager role at Example Co. That improves reliability without overstating scope or outcomes across the first operating lane.',
            'Across teams, I built operating reviews that kept queue health, staffing tradeoffs, and service quality visible to leadership. It keeps the work grounded in the Program Manager role at Example Co. That clarifies ownership and reduces ambiguity in day-to-day decisions across the second operating lane.',
          ],
          closingParagraph: 'I would welcome the chance to discuss how this background supports the Program Manager role at Example Co.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content:
          'Dear Hiring Team,\\n\\n' +
          'I am focused on the Program Manager role at Example Co. Led enterprise support modernization across global teams and built repeatable operating rhythms that improved execution clarity.\\n\\n' +
          'In prior roles, I led support operations programs across a SaaS platform and reduced escalation churn through clearer ownership. That keeps the work grounded in the Program Manager role at Example Co. That improves reliability without overstating scope or outcomes across the first operating lane.\\n\\n' +
          'Across teams, I built operating reviews that kept queue health, staffing tradeoffs, and service quality visible to leadership. It keeps the work grounded in the Program Manager role at Example Co. That clarifies ownership and reduces ambiguity in day-to-day decisions across the second operating lane.\\n\\n' +
          'I would welcome the chance to discuss how this background supports the Program Manager role at Example Co.\\n\\n' +
          'Sincerely,\\n\\n' +
          'Jordan Lee',
        wordCount: 260,
        greeting: 'Dear Hiring Team,',
        paragraphs: [
          'I am focused on the Program Manager role at Example Co. Led enterprise support modernization across global teams and built repeatable operating rhythms that improved execution clarity.',
          'In prior roles, I led support operations programs across a SaaS platform and reduced escalation churn through clearer ownership. That keeps the work grounded in the Program Manager role at Example Co. That improves reliability without overstating scope or outcomes across the first operating lane.',
          'Across teams, I built operating reviews that kept queue health, staffing tradeoffs, and service quality visible to leadership. It keeps the work grounded in the Program Manager role at Example Co. That clarifies ownership and reduces ambiguity in day-to-day decisions across the second operating lane.',
        ],
        closingParagraphs: ['I would welcome the chance to discuss how this background supports the Program Manager role at Example Co.'],
        paragraphEvidence: canonicalParagraphEvidence,
      },
      complianceResult: {
        normalizedContent: 'This cover letter ends with and',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const readiness = await service.getGenerationReadiness('user-1', { ...request, baselineVersionId: null } as any);
    expect(readiness.status).toBe('ready');
  });

  it('returns a controlled blocked readiness when required IDs are missing', async () => {
    const { service, studioArtifactsService } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft');

    const readiness = await service.getGenerationReadiness('user-1', {
      baselineId: '',
      jobId: '',
      analysisId: '',
      baselineVersionId: null,
    } as any);

    expect(buildDraftSpy).not.toHaveBeenCalled();
    expect(readiness.status).toBe('blocked');
    expect(readiness.blocked).toBe(true);
  });

  it('returns readiness ready and allows generation in READY state', async () => {
    const { service, studioArtifactsService } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generationAuthority: 'canonical',
      baselineVerified: true,
      baselineFileUsable: true,
      qualityGate: { status: 'pass', reasons: [] },
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 260,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: canonicalParagraphEvidence,
      },
      complianceResult: {
        normalizedContent: 'This cover letter is complete and ready for export.',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const readiness = await service.getGenerationReadiness('user-1', request as any);
    expect(readiness.status).toBe('ready');

    const result = await service.generateCoverLetter('user-1', request as any);
    expect(result.status).toBe('success');
    expect(result.exportReady).toBe(true);
    expect(result.exports).toEqual({ docx: true, pdf: true });
    expect(result.actions.canExport).toBe(true);
    expect(result.preview?.coverLetter).toBeTruthy();
    expect((result as any).content).toBeTruthy();
    const content = String((result as any).content);
    for (const line of content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      expect(line).not.toMatch(/\b(?:the|a|an|and|but|because|with|for|to|of|in|on|at|by|from)\s*$/i);
    }
    expect(studioArtifactsService.recordCoverLetterSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/\S/),
        responseBody: expect.objectContaining({
          content: expect.any(String),
          qualityGate: expect.any(Object),
          quality: expect.any(Object),
        }),
      }),
    );
    buildDraftSpy.mockRestore();
  });

  it('does not recover sparse canonical baselines from persisted ResumeV2 evidence', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;
    const originalScore = assessment.overallScore;
    assessment.overallScore = 90;

    try {
      baseline.sections = [] as any;
      baseline.parsedRecords = [
        {
          createdAt: new Date(),
          parsedJson: {
            identity: { full_name: 'Jordan Lee' },
            experience: [
              {
                company: 'Example Co',
                role_title: 'Director of Customer Operations',
                details_text: '',
              },
            ],
          },
          flagsJson: {
            reviewState: { verified: true },
          },
          resumeV2Json: {
            heading: { name: 'Jordan Lee', contactLine: 'jordan.lee@example.com | Seattle, WA' },
            summary: 'Sparse persisted Resume V2 that must not become authoritative.',
            competencies: ['Support Operations'],
            experience: [
              {
                company: 'Persisted Co',
                roleTitle: 'Legacy Role',
                dateRange: '2020 - 2021',
                bullets: ['Legacy evidence that should not rescue generation.'],
              },
              {
                company: 'Persisted Co',
                roleTitle: 'Legacy Role Two',
                dateRange: '2021 - Present',
                bullets: ['Additional legacy evidence that should not rescue generation.'],
              },
            ],
          },
        } as any,
      ];

      await expect(service.generateCoverLetter('user-1', request as any)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'canonical_cover_letter_evidence_insufficient',
        }),
      });
    } finally {
      baseline.sections = originalSections;
      baseline.parsedRecords = originalParsed;
      assessment.overallScore = originalScore;
    }
  });

  it('does not mark a cover letter exportReady when the quality gate needs refinement', async () => {
    const { service } = buildService();
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generationAuthority: 'canonical',
      baselineVerified: true,
      baselineFileUsable: true,
      qualityGate: { status: 'pass', reasons: [] },
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 260,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: canonicalParagraphEvidence,
      },
      complianceResult: {
        normalizedContent: 'This cover letter still needs refinement.',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
      qualityGate: { status: 'needs_refinement', reasons: ['missing_letter_structure'] },
      firstPassQualityGate: { status: 'needs_refinement', reasons: ['missing_letter_structure'] },
      qualityRepairAttempted: false,
    });

    const result = await service.generateCoverLetter('user-1', request as any);

    expect(result.status).toBe('success');
    expect(result.exportReady).toBe(false);
    expect(result.exports).toEqual({ docx: false, pdf: false });
    buildDraftSpy.mockRestore();
  });

  it('renders the canonical cover-letter template with the expected structure', async () => {
    const template = getDocxTemplate<CoverLetterDocxModel>('cover_letter', DEFAULT_COVER_LETTER_TEMPLATE_KEY);
    const model = mapCoverLetterResultToModel(
      {
        document: {
          senderHeading: { name: 'Jordan Lee', contactLine: 'jordan@example.com' },
          dateLine: 'June 21, 2026',
          recipientLine: ['Program Manager', 'Example Co'],
          salutation: 'Dear Hiring Team,',
          opening: 'Opening paragraph.',
          bodyParagraphs: ['Body paragraph one.', 'Body paragraph two.'],
          closingParagraph: 'Closing paragraph.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\n\nOpening paragraph.\n\nBody paragraph one.\n\nBody paragraph two.\n\nClosing paragraph.\n\nSincerely,\n\nJordan Lee',
        wordCount: 28,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening paragraph.', 'Body paragraph one.', 'Body paragraph two.'],
        closingParagraphs: ['Closing paragraph.'],
        salutation: 'Dear Hiring Team,',
        closing: 'Sincerely,\nJordan Lee',
        traceMap: {},
      } as any,
      undefined,
      { title: 'Program Manager', company: 'Example Co' },
      { dateLine: 'June 21, 2026' },
    );
    const result = await template.render(model, {
      templateKey: DEFAULT_COVER_LETTER_TEMPLATE_KEY,
      font: 'Calibri',
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    });
    expect(result.buffer.byteLength).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(result.buffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    expect(documentXml).toContain('Dear Hiring Team,');
    expect(documentXml).toContain('Sincerely,');
    expect(documentXml).toContain('Jordan Lee');
    expect(documentXml).toContain('Program Manager');
    expect(documentXml).toContain('Example Co');
  });

  it('generates a cover letter when analysisId is omitted but a recent assessment exists', async () => {
    const { service } = buildService();
    const originalSections = baseline.sections;
    const originalParsed = baseline.parsedRecords;

    baseline.sections = createCanonicalCoverLetterSections();
    (baseline as any).parsedRecords = [createCanonicalPersistedResumeV2Record()];

    try {
      await expect(
        (service as any).buildCoverLetterDraft('user-1', {
          baselineId: 'baseline-1',
          baselineVersionId: 'baseline-version-1',
          jobId: 'job-1',
          analysisId: null,
          oneTap: true,
        } as any),
      ).resolves.toMatchObject({
        generationAuthority: 'canonical',
        baselineVerified: true,
        baselineFileUsable: true,
      });
    } finally {
      baseline.sections = originalSections;
      (baseline as any).parsedRecords = originalParsed;
    }
  });

  it('reuses a completed generation request instead of creating a duplicate artifact', async () => {
    const { service, coverRepo, workflowIdempotencyService } = buildService();
    const originalScore = assessment.overallScore;
    assessment.overallScore = 70;
    const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generationAuthority: 'canonical',
      baselineVerified: true,
      baselineFileUsable: true,
      qualityGate: { status: 'pass', reasons: [] },
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team',
        wordCount: 260,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: canonicalParagraphEvidence,
      },
      complianceResult: {
        normalizedContent: ['Line one ends with and', 'Second line ends with with', 'A complete sentence.'].join('\n'),
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });
    workflowIdempotencyService.reserve = jest.fn().mockResolvedValue({
      status: 'existing_completed',
      runId: 'run-1',
      responseBody: {
        status: 'success',
        generationStatus: 'success',
        exportReady: false,
        id: 'cover-existing',
        userId: 'user-1',
        baselineId: 'baseline-1',
        jobId: 'job-1',
        content: 'cached',
        generatorType: 'template',
        generatorVersion: 'v1',
        closingTemplateKey: 'default',
        generationInputsHash: 'hash',
        preview: {
          coverLetter: {
            senderHeading: { name: 'Jordan Lee' },
            salutation: 'Dear Hiring Team,',
            opening: 'Opening paragraph.',
            bodyParagraphs: ['Body paragraph one.', 'Body paragraph two.'],
            closingParagraph: 'Closing paragraph.',
            signoff: 'Sincerely,',
            signatureName: 'Jordan Lee',
          },
        },
        compliance_flags: [],
        audit_id: 'audit-1',
        auditId: 'audit-1',
        baseline_version_hash: 'hash-1',
        exports: { docx: false, pdf: false },
        display: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
        safeDisplay: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
        traceMap: {},
        debugTrace: { passed: true, failures: [], traceCoverage: 100, unusedEvidence: [], selectedEvidence: [] },
        qualityGate: { status: 'pass', reasons: [] },
        internal: {
          auditId: 'audit-1',
          baselineVersionHash: 'hash-1',
          complianceFlags: [],
          generationMode: 'structured_baseline_template',
          templateVersion: 'structured-baseline-v1',
        },
      },
    }) as any;

    const result = await service.generateCoverLetter('user-1', request as any);

    expect(result.id).toBe('cover-existing');
    expect(result.idempotency?.reused).toBe(true);
    expect(result.exportReady).toBe(true);
    expect(result.exports).toEqual({ docx: true, pdf: true });
    expect(result.actions.canExport).toBe(true);
    expect(coverRepo.save).not.toHaveBeenCalled();
    buildDraftSpy.mockRestore();
    assessment.overallScore = originalScore;
  });

  it('forces regeneration for score >= 80 when an existing completed artifact is legacy', async () => {
    const { service, coverRepo, workflowIdempotencyService } = buildService();
    const assembler = require('./coverLetterTemplateAssembler');
    const assembleSpy = jest.spyOn(assembler, 'assembleCoverLetterFromStructuredBaseline');

    try {
      const buildDraftSpy = jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
        baseline,
        baselineVersion,
        job,
        analysisAssessment: assessment,
        allowedBlocks: [],
        templateReadiness: {
          canGenerateResume: true,
          canGenerateCoverLetter: true,
          hardBlockReasons: [],
          warnings: [],
          stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
        },
        jobContext: {
          id: 'job-1',
          title: 'Program Manager',
          company: 'Example Co',
          responsibilities: [],
          requirements: [],
        },
        jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
        closingTemplateKey: 'default',
        generationInputsHash: 'hash',
        generation: {
          ...(() => {
            const allowedBlocks = [
              {
                id: 'parsed-experience-0',
                title: 'Example Co - Program Manager',
                content: [
                  'Example Co | Program Manager | 2020 - 2024',
                  '- Led enterprise support modernization across global teams.',
                  '- Improved escalation readiness, incident response quality, and KPI governance using repeatable operational systems.',
                ].join('\n'),
                includePolicy: 'OPTIONAL',
                order: 0,
                sectionType: 'EXPERIENCE',
              },
              {
                id: 'parsed-experience-1',
                title: 'Example Co - Senior Program Manager',
                content: [
                  'Example Co | Senior Program Manager | 2018 - 2020',
                  '- Partnered cross-functionally to tighten ownership and operating reviews.',
                  '- Built reporting rhythms that made service reliability and stakeholder communication easier to manage.',
                ].join('\n'),
                includePolicy: 'OPTIONAL',
                order: 1000,
                sectionType: 'EXPERIENCE',
              },
            ] as const;
            const assembly = assembler.assembleCoverLetterFromStructuredBaseline({
            structured: {
              contact: undefined,
              summary: undefined,
              experience: [
                {
                  company: 'Example Co',
                  roleTitle: 'Program Manager',
                  dates: '2020 - 2024',
                  bullets: [
                    'Led enterprise support modernization across global teams.',
                    'Improved escalation readiness, incident response quality, and KPI governance using repeatable operational systems.',
                  ],
                  source: 'baseline',
                },
                {
                  company: 'Example Co',
                  roleTitle: 'Senior Program Manager',
                  dates: '2018 - 2020',
                  bullets: [
                    'Partnered cross-functionally to tighten ownership and operating reviews.',
                    'Built reporting rhythms that made service reliability and stakeholder communication easier to manage.',
                  ],
                  source: 'baseline',
                },
              ],
              education: [],
              skills: [],
              missingEvidenceReasons: [],
            },
            senderName: 'Jordan Lee',
            senderContactLine: null,
            jobTitle: job.title,
            companyName: job.company,
            allowedBlocks,
            });
            const renderedParagraphs = [
              assembly.document.opening,
              ...(assembly.document.bodyParagraphs ?? []),
              assembly.document.closingParagraph,
            ];
            return {
              document: assembly.document,
              paragraphEvidence: assembly.paragraphEvidence,
              content: [
                'Dear Hiring Team,',
                ...renderedParagraphs,
                'Sincerely,',
                'Jordan Lee',
              ].join('\n\n'),
              wordCount: [
                'Dear Hiring Team,',
                ...renderedParagraphs,
                'Sincerely,',
                'Jordan Lee',
              ].join(' ').split(/\s+/).filter(Boolean).length,
              greeting: 'Dear Hiring Team,',
              paragraphs: [assembly.document.opening, ...(assembly.document.bodyParagraphs ?? [])],
              closingParagraphs: [assembly.document.closingParagraph],
              traceMap: {},
            };
          })(),
        },
        complianceResult: {
          normalizedContent: 'This cover letter is complete and ready for export.',
          complianceFlags: [],
          blocked: false,
          audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
        },
      });

      const result = await service.generateCoverLetter('user-1', request as any);

      expect(assembleSpy).toHaveBeenCalled();
      expect(workflowIdempotencyService.reserve).not.toHaveBeenCalled();
      expect(result.id).toBeTruthy();
      expect(result.internal?.generationMode).toBe('structured_baseline_template');
      expect(result.internal?.templateVersion).toBe('structured-baseline-v1');
      expect((result as any).evidenceDetailsMap).toBeUndefined();
      expect((result as any).internal?.interpretedEvidenceSummary).toBeUndefined();
      expect(coverRepo.save).toHaveBeenCalled();
      buildDraftSpy.mockRestore();
    } finally {
      assembleSpy.mockRestore();
    }
  });

  it('returns readiness limited and allows generation', async () => { 
    const { service, coverRepo } = buildService({
      complianceFlags: [
        {
          code: 'personalization_limitation',
          message: 'Generation is limited by verification constraints.',
          severity: ComplianceFlagSeverity.WARN,
        },
      ],
      blocked: false,
    });
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 120,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: canonicalParagraphEvidence,
      },
      complianceResult: {
        normalizedContent: 'This cover letter is limited by verification constraints but still complete.',
        complianceFlags: [
          {
            code: 'personalization_limitation',
            message: 'Generation is limited by verification constraints.',
            severity: ComplianceFlagSeverity.WARN,
          },
        ],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const readiness = await service.getGenerationReadiness('user-1', request as any);
    expect(readiness.status).toBe('limited');

    await expect(service.generateCoverLetter('user-1', request as any)).resolves.toBeTruthy(); 
    expect(coverRepo.save).toHaveBeenCalled(); 
  }); 
 
  it('does not return readiness BLOCKED for score >= 80 when verification gaps exist (verified-only lane)', async () => { 
    const { service } = buildService({ 
      complianceFlags: [ 
        { 
          code: 'full_block', 
          message: 'Missing verified evidence for role-critical statements.', 
          severity: ComplianceFlagSeverity.BLOCK, 
        }, 
      ], 
      blocked: true, 
    }); 
    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({ 
      baseline, 
      baselineVersion, 
      job, 
      analysisAssessment: assessment, 
      allowedBlocks: [], 
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: { 
        id: 'job-1', 
        title: 'Program Manager', 
        company: 'Example Co', 
        responsibilities: [], 
        requirements: [], 
      }, 
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] }, 
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: {
        document: {
          senderHeading: { name: 'Jordan Lee' },
          salutation: 'Dear Hiring Team,',
          opening: 'Opening.',
          bodyParagraphs: ['Body one.', 'Body two.'],
          closingParagraph: 'Closing.',
          signoff: 'Sincerely,',
          signatureName: 'Jordan Lee',
        },
        content: 'Dear Hiring Team,\\n\\nOpening.\\n\\nBody one.\\n\\nBody two.\\n\\nClosing.\\n\\nSincerely,\\n\\nJordan Lee',
        wordCount: 120,
        greeting: 'Dear Hiring Team,',
        paragraphs: ['Opening.', 'Body one.', 'Body two.'],
        closingParagraphs: ['Closing.'],
        paragraphEvidence: canonicalParagraphEvidence,
      },
      complianceResult: {
        normalizedContent: 'This cover letter draft is blocked due to missing verification but has content.',
        complianceFlags: [
          {
            code: 'full_block',
            message: 'Missing verified evidence for role-critical statements.',
            severity: ComplianceFlagSeverity.BLOCK, 
          }, 
        ], 
        blocked: true, 
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' }, 
      }, 
    }); 
 
    const readiness = await service.getGenerationReadiness('user-1', request as any); 
    expect(readiness.status).toBe('limited'); 
    expect(readiness.blocked).toBe(false); 
    expect(readiness.reasons[0]?.code).toBe('verified_only_generation'); 
  }); 

  it('falls back to verified-only generation for score >= 30 when readiness is BLOCKED', async () => { 
    const { service, coverRepo } = buildService({ 
      complianceFlags: [ 
        {
          code: 'full_block',
          message: 'Missing verified evidence for role-critical statements.',
          severity: ComplianceFlagSeverity.BLOCK,
        },
      ],
      blocked: true,
    });
    const draftBlocked = {
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
      generation: { document: { opening: '', bodyParagraphs: [], closingParagraph: '' } },
      complianceResult: {
        normalizedContent: 'blocked',
        complianceFlags: [
          {
            code: 'full_block',
            message: 'Missing verified evidence for role-critical statements.',
            severity: ComplianceFlagSeverity.BLOCK,
          },
        ],
        blocked: true,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    };
    const draftRecovered = {
      ...draftBlocked,
      complianceResult: {
        normalizedContent: 'This cover letter is limited by verification constraints but still complete.',
        complianceFlags: [
          {
            code: 'personalization_limitation',
            message: 'Generation is limited by verification constraints.',
            severity: ComplianceFlagSeverity.WARN,
          },
        ],
        blocked: false,
        audit: { id: 'audit-2', baselineVersionHash: 'hash-1' },
      },
    };
    jest
      .spyOn(service as any, 'buildCoverLetterDraft')
      .mockResolvedValueOnce(draftBlocked)
      .mockResolvedValueOnce(draftRecovered);

    await expect(service.generateCoverLetter('user-1', request as any)).resolves.toBeTruthy();
    expect(coverRepo.save).toHaveBeenCalled();
  });

  it('does not flag keyword stuffing for a substantive support-heavy paragraph that still contains diverse evidence', () => {
    const { service } = buildService();
    const detector = (service as any).detectKeywordStuffing.bind(service);

    expect(
      detector([
        'As a Program Manager at Example Co, I support support support support support support support support support support customer experience, service delivery, escalation handling, team coaching, and operational governance across the organization.',
      ]),
    ).toBe(false);
    expect(
      detector([
        'support support support support support support support support support support support support support support support support support support support support support support support support',
      ]),
    ).toBe(true);
  });

  it('forces structured template regeneration and overwrites an existing legacy artifact when score >= 80', async () => {
    const { service, coverRepo, workflowIdempotencyService } = buildService();
    const assembler = require('./coverLetterTemplateAssembler');

    // Do not allow idempotency reuse at all for score >= 80.
    (workflowIdempotencyService.reserve as jest.Mock).mockResolvedValue({
      status: 'existing_completed',
      runId: 'legacy-run',
      responseBody: { id: 'cover-legacy', internal: {} },
    });

    const existing = {
      id: 'cover-existing',
      userId: 'user-1',
      baselineId: 'baseline-1',
      jobId: 'job-1',
      generationInputsHash: 'hash',
      content: 'legacy content',
    };
    (coverRepo.findOne as jest.Mock).mockResolvedValue(existing);
    (coverRepo.save as jest.Mock)
      .mockImplementationOnce(() => {
        const err: any = new Error('duplicate key');
        err.code = '23505';
        throw err;
      })
      .mockImplementationOnce(async (payload: any) => ({ ...payload, id: existing.id }));

    jest.spyOn(service as any, 'buildCoverLetterDraft').mockResolvedValue({
      baseline,
      baselineVersion,
      job,
      analysisAssessment: assessment,
      allowedBlocks: [],
      templateReadiness: {
        canGenerateResume: true,
        canGenerateCoverLetter: true,
        hardBlockReasons: [],
        warnings: [],
        stats: { totalExperience: 1, validExperience: 1, invalidExperience: 0 },
      },
      jobContext: {
        id: 'job-1',
        title: 'Program Manager',
        company: 'Example Co',
        responsibilities: [],
        requirements: [],
      },
      jobContextAllowlist: { allowedCompanies: ['Example Co'], allowedRoleTitles: ['Program Manager'] },
      closingTemplateKey: 'default',
      generationInputsHash: 'hash',
        generation: {
          ...(() => {
            const allowedBlocks = [
              {
                id: 'parsed-experience-0',
                title: 'Example Co - Program Manager',
                content: [
                  'Example Co | Program Manager | 2020 - 2024',
                  '- Led enterprise support modernization across global teams.',
                  '- Improved escalation readiness, incident response quality, and KPI governance using repeatable operational systems.',
                ].join('\n'),
                includePolicy: 'OPTIONAL',
                order: 0,
                sectionType: 'EXPERIENCE',
              },
              {
                id: 'parsed-experience-1',
                title: 'Example Co - Senior Program Manager',
                content: [
                  'Example Co | Senior Program Manager | 2018 - 2020',
                  '- Partnered cross-functionally to tighten ownership and operating reviews.',
                  '- Built reporting rhythms that made service reliability and stakeholder communication easier to manage.',
                ].join('\n'),
                includePolicy: 'OPTIONAL',
                order: 1000,
                sectionType: 'EXPERIENCE',
              },
            ] as const;
            const assembly = assembler.assembleCoverLetterFromStructuredBaseline({
          structured: {
            contact: undefined,
            summary: undefined,
            experience: [
              {
                company: 'Example Co',
                roleTitle: 'Program Manager',
                dates: '2020 - 2024',
                bullets: [
                  'Led enterprise support modernization across global teams.',
                  'Improved escalation readiness, incident response quality, and KPI governance using repeatable operational systems.',
                ],
                source: 'baseline',
              },
              {
                company: 'Example Co',
                roleTitle: 'Senior Program Manager',
                dates: '2018 - 2020',
                bullets: [
                  'Partnered cross-functionally to tighten ownership and operating reviews.',
                  'Built reporting rhythms that made service reliability and stakeholder communication easier to manage.',
                ],
                source: 'baseline',
              },
            ],
            education: [],
            skills: [],
            missingEvidenceReasons: [],
          },
          senderName: 'Jordan Lee',
          senderContactLine: null,
          jobTitle: job.title,
          companyName: job.company,
          allowedBlocks,
          });
          const renderedParagraphs = [
            assembly.document.opening,
            ...(assembly.document.bodyParagraphs ?? []),
            assembly.document.closingParagraph,
          ];
          return {
            document: assembly.document,
            paragraphEvidence: assembly.paragraphEvidence,
            content: [
              'Dear Hiring Team,',
              ...renderedParagraphs,
              'Sincerely,',
              'Jordan Lee',
            ].join('\n\n'),
            wordCount: [
              'Dear Hiring Team,',
              ...renderedParagraphs,
              'Sincerely,',
              'Jordan Lee',
            ].join(' ').split(/\s+/).filter(Boolean).length,
            greeting: 'Dear Hiring Team,',
            paragraphs: [assembly.document.opening, ...(assembly.document.bodyParagraphs ?? [])],
            closingParagraphs: [assembly.document.closingParagraph],
            traceMap: {},
          };
        })(),
      },
      complianceResult: {
        normalizedContent: 'This cover letter is complete and ready for export.',
        complianceFlags: [],
        blocked: false,
        audit: { id: 'audit-1', baselineVersionHash: 'hash-1' },
      },
    });

    const result = await service.generateCoverLetter('user-1', request as any);

    expect(workflowIdempotencyService.reserve).not.toHaveBeenCalled();
    expect(result.id).toBe(existing.id);
    expect(result.id).not.toBe('cover-legacy');
    expect(result.internal?.generationMode).toBe('structured_baseline_template');
    expect(result.internal?.templateVersion).toBe('structured-baseline-v1');
    expect(coverRepo.save).toHaveBeenCalled();
  });

  it('throws generation_failed when output validation is invalid', async () => {
    const { service } = buildService();
    const privateService = service as unknown as {
      throwCoverLetterQualityError: (flags: string[], stage: string) => never;
    };

    expect(() =>
      privateService.throwCoverLetterQualityError(['missing_paragraphs'], 'post_processing'),
    ).toThrow(UnprocessableEntityException);

    try {
      privateService.throwCoverLetterQualityError(['missing_paragraphs'], 'post_processing');
    } catch (error) {
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'generation_failed',
        message: 'Cover letter generation failed validation.',
      });
    }
  });
});
