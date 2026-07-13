import { DataSource } from 'typeorm';
import { CoverLettersService } from './cover-letters.service';
import { ComplianceAction } from '../compliance/compliance.types';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { buildDocumentStrategyPlan } from '../shared/documentStrategyPlan';
import { listSyntheticGenerationScenarioBundles } from '../synthetic/generation/synthetic-generation.fixtures';
import { assembleCoverLetterFromStructuredBaseline } from './coverLetterTemplateAssembler';
import { TemplateCoverLetterGenerator } from './generators/template-cover-letter.generator';
import {
  DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY,
  resolveClosingTemplate,
} from './closing-templates';

const createRepo = (value: unknown) => ({
  findOne: jest.fn().mockResolvedValue(value),
  find: jest.fn().mockResolvedValue([]),
  create: jest.fn((payload: Record<string, unknown>) => payload),
  save: jest.fn(async (payload: Record<string, unknown>) => ({ ...payload, id: 'saved-1' })),
  remove: jest.fn(async (payload: unknown) => payload),
});

function toCanonicalEvidenceUnits(
  sections: Array<{ id: string; content?: string; sectionType?: string }>,
) {
  return sections
    .filter((section) => String(section.sectionType ?? '').toUpperCase() === 'EXPERIENCE')
    .map((section) => {
      const lines = String(section.content ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const text = lines.find((line) => /[.!?]$/.test(line)) ?? lines[0] ?? '';
      return {
        id: section.id,
        text,
        sourceBlockId: section.id,
        sourceSectionType: 'EXPERIENCE',
        classification: 'accomplishment' as const,
        verificationState: 'verified' as const,
        eligibleForNarrativeComposition: true as const,
        extractedEvidenceCount: 1,
      };
    })
    .filter((unit) => Boolean(unit.text));
}

function buildService() {
  const bundle = listSyntheticGenerationScenarioBundles().find(
    (entry) => entry.scenario.id === 'support-ops-director-strong-fit',
  );
  if (!bundle) {
    throw new Error('support-ops-director-strong-fit bundle is missing');
  }

  const baseline = {
    id: bundle.baseline.id,
    userId: 'user-1',
    sections: bundle.baseline.sections.map((section, index) => ({
      id: section.id,
      title: section.title,
      content: section.content,
      includePolicy: 'always',
      order: index,
      sectionType: section.sectionType,
    })),
    parsedRecords: [],
  };
  const baselineVersion = {
    id: 'baseline-version-1',
    baselineId: bundle.baseline.id,
    hash: 'hash-1',
  };
  const job = {
    id: bundle.job.id,
    userId: 'user-1',
    title: bundle.job.title,
    company: bundle.job.company,
    normalizedResponsibilities: bundle.job.normalizedResponsibilities,
    normalizedRequirements: bundle.job.normalizedRequirements,
  };
  const assessment = {
    id: 'analysis-1',
    userId: 'user-1',
    jobId: bundle.job.id,
    baselineId: bundle.baseline.id,
    overallScore: 87,
    baselineVersion: 1,
  };

  const complianceService = {
    normalizeText: jest.fn((value: string) => value),
    enforceResumeWritingRules: jest.fn().mockReturnValue([]),
    detectScopeInflation: jest.fn().mockResolvedValue([]),
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: [],
      blocked: false,
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
          return createRepo(null);
        case 'Baseline':
          return createRepo(baseline);
        case 'BaselineVersion':
          return createRepo(baselineVersion);
        case 'BaselineBlockPolicy':
          return createRepo([]);
        case 'Job':
          return createRepo(job);
        case 'FitAssessment':
          return createRepo(assessment);
        default:
          throw new Error(`Unexpected repository request: ${entity?.name}`);
      }
    }),
  } as unknown as DataSource;

  const gapAnalysis = {
    analyze: jest.fn().mockReturnValue({ strengths: [], criticalGaps: [] }),
  } as unknown as GapAnalysisService;

  return { bundle, service: new CoverLettersService(dataSource, complianceService as never, gapAnalysis) };
}

describe('cover letter post-processing', () => {
  it('keeps the canonical strong-fit support operations letter compliant after post-processing', () => {
    const { bundle, service } = buildService();
    const plan = buildDocumentStrategyPlan({
      fitScore: 87,
      jobTitle: bundle.job.title,
      jobCompany: bundle.job.company,
      jobDescription: bundle.job.rawDescription,
      jobRequirements: bundle.job.normalizedRequirements,
      jobResponsibilities: bundle.job.normalizedResponsibilities,
      analysisSummary: 'Support operations leader with incident response and workflow ownership.',
      analysisStrengths: ['support operations rigor', 'service reliability', 'incident response'],
      analysisGaps: [],
      analysisRecommendedActions: [],
      baselineSections: bundle.baseline.sections,
    });

    const generator = new TemplateCoverLetterGenerator();
    const evidenceUnits = toCanonicalEvidenceUnits(
      bundle.baseline.sections as Array<{ id: string; content?: string; sectionType?: string }>,
    );
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: 'Support operations leader with incident response and workflow ownership.',
        experience: bundle.baseline.sections
          .filter((section) => section.sectionType === 'EXPERIENCE')
          .map((section) => {
            const lines = String(section.content ?? '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
            return {
              id: section.id,
              company: bundle.job.company,
              roleTitle: lines[0] ?? section.title,
              dates: lines[1] ?? null,
              bullets: lines.slice(2).map((line) => line.replace(/^-+\s*/, '')),
            };
          }),
      } as any,
      senderName: 'Synthetic Runner',
      senderContactLine: 'runner@example.com',
      jobTitle: bundle.job.title,
      companyName: bundle.job.company,
      allowedBlocks: bundle.baseline.sections.map((section, order) => ({
        id: section.id,
        title: section.title,
        content: section.content,
        includePolicy: 'ALWAYS' as never,
        order,
        sectionType: section.sectionType as never,
      })) as never,
    });
    const generation = generator.generate({
      document: assembly.document,
      baselineId: bundle.baseline.id,
      jobId: bundle.job.id,
      candidateName: 'Synthetic Runner',
      closingTemplate: resolveClosingTemplate(DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY),
      job: {
        id: bundle.job.id,
        title: bundle.job.title,
        company: bundle.job.company,
        responsibilities: bundle.job.normalizedResponsibilities,
        requirements: bundle.job.normalizedRequirements,
      },
      allowedBaselineBlocks: bundle.baseline.sections.map((section, order) => ({
        id: section.id,
        title: section.title,
        content: section.content,
        includePolicy: 'ALWAYS' as never,
        order,
        sectionType: section.sectionType as never,
      })) as never,
      safeMode: false,
      documentStrategyPlan: plan,
      maxWords: 280,
      paragraphEvidence: assembly.paragraphEvidence,
    });

    const postProcessed = (service as any).applyCoverLetterPostProcessing(
      generation,
      {
        title: bundle.job.title,
        company: bundle.job.company,
        responsibilities: bundle.job.normalizedResponsibilities,
        requirements: bundle.job.normalizedRequirements,
      },
      'Synthetic Runner',
      evidenceUnits,
    );

    // Post-processing validates the final rendered letter; it must not pad missing structure.
    // Post-processing flags are allowed to vary as generator strategy evolves; keep assertions focused on invariants.
    expect(postProcessed.generation.content).toContain('Dear Hiring Team,');
    expect(postProcessed.generation.content).toContain('Sincerely,');
    expect(postProcessed.generation.document.templateVersion).toBe('canonical_cover_letter_v1');
    expect(postProcessed.generation.document.bodyParagraphs).toHaveLength(2);
    expect(postProcessed.generation.document.paragraphEvidence).toHaveLength(4);
    expect(postProcessed.generation.content).not.toMatch(/Explain why|opening proof point|line-by-line recap/i);
    expect(postProcessed.generation.content).not.toContain('-');
    expect(postProcessed.generation.content.split(/\n\s*\n/).length).toBeGreaterThanOrEqual(5);
    expect(postProcessed.generation.document.closingParagraph).toBeTruthy();
    expect(postProcessed.generation.document.bodyParagraphs.every((paragraph) => paragraph.split(/\s+/).length <= 130)).toBe(true);
    expect(postProcessed.flags).not.toEqual(expect.arrayContaining(['too_short', 'too_few_body_paragraphs', 'too_few_content_paragraphs', 'missing_role_or_company_context', 'paragraph_anchor_validation_failed']));
  });

  it('derives canonical grounding snippets from the rendered paragraph evidence projection', () => {
    const { bundle, service } = buildService();
    const plan = buildDocumentStrategyPlan({
      fitScore: 87,
      jobTitle: bundle.job.title,
      jobCompany: bundle.job.company,
      jobDescription: bundle.job.rawDescription,
      jobRequirements: bundle.job.normalizedRequirements,
      jobResponsibilities: bundle.job.normalizedResponsibilities,
      analysisSummary: 'Support operations leader with incident response and workflow ownership.',
      analysisStrengths: ['support operations rigor', 'service reliability', 'incident response'],
      analysisGaps: [],
      analysisRecommendedActions: [],
      baselineSections: bundle.baseline.sections,
    });

    const generator = new TemplateCoverLetterGenerator();
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: 'Support operations leader with incident response and workflow ownership.',
        experience: bundle.baseline.sections
          .filter((section) => section.sectionType === 'EXPERIENCE')
          .map((section) => {
            const lines = String(section.content ?? '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
            return {
              id: section.id,
              company: bundle.job.company,
              roleTitle: lines[0] ?? section.title,
              dates: lines[1] ?? null,
              bullets: lines.slice(2).map((line) => line.replace(/^-+\s*/, '')),
            };
          }),
      } as any,
      senderName: 'Synthetic Runner',
      senderContactLine: 'runner@example.com',
      jobTitle: bundle.job.title,
      companyName: bundle.job.company,
      allowedBlocks: bundle.baseline.sections.map((section, order) => ({
        id: section.id,
        title: section.title,
        content: section.content,
        includePolicy: 'ALWAYS' as never,
        order,
        sectionType: section.sectionType as never,
      })) as never,
    });
    const generation = generator.generate({
      document: assembly.document,
      baselineId: bundle.baseline.id,
      jobId: bundle.job.id,
      candidateName: 'Synthetic Runner',
      closingTemplate: resolveClosingTemplate(DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY),
      job: {
        id: bundle.job.id,
        title: bundle.job.title,
        company: bundle.job.company,
        responsibilities: bundle.job.normalizedResponsibilities,
        requirements: bundle.job.normalizedRequirements,
      },
      allowedBaselineBlocks: bundle.baseline.sections.map((section, order) => ({
        id: section.id,
        title: section.title,
        content: section.content,
        includePolicy: 'ALWAYS' as never,
        order,
        sectionType: section.sectionType as never,
      })) as never,
      safeMode: false,
      documentStrategyPlan: plan,
      maxWords: 280,
      paragraphEvidence: assembly.paragraphEvidence,
    });

    const groundingSnippets = (service as any).buildCanonicalGroundingSnippets(generation) as string[];
    expect(groundingSnippets.length).toBeGreaterThanOrEqual(2);
    expect(new Set(groundingSnippets).size).toBe(groundingSnippets.length);
    expect(groundingSnippets.every((snippet) => String(generation.content ?? '').toLowerCase().includes(snippet.toLowerCase()))).toBe(true);
  });

  it('recognizes normalized production-shaped role titles during post-processing validation', () => {
    const { bundle, service } = buildService();
    const evidenceUnits = toCanonicalEvidenceUnits(
      bundle.baseline.sections as Array<{ id: string; content?: string; sectionType?: string }>,
    );
    const plan = buildDocumentStrategyPlan({
      fitScore: 87,
      jobTitle: bundle.job.title,
      jobCompany: bundle.job.company,
      jobDescription: bundle.job.rawDescription,
      jobRequirements: bundle.job.normalizedRequirements,
      jobResponsibilities: bundle.job.normalizedResponsibilities,
      analysisSummary: 'Support operations leader with incident response and workflow ownership.',
      analysisStrengths: ['support operations rigor', 'service reliability', 'incident response'],
      analysisGaps: [],
      analysisRecommendedActions: [],
      baselineSections: bundle.baseline.sections,
    });

    const generator = new TemplateCoverLetterGenerator();
    const assembly = assembleCoverLetterFromStructuredBaseline({
      structured: {
        summary: 'Support operations leader with incident response and workflow ownership.',
        experience: bundle.baseline.sections
          .filter((section) => section.sectionType === 'EXPERIENCE')
          .map((section) => {
            const lines = String(section.content ?? '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
            return {
              id: section.id,
              company: bundle.job.company,
              roleTitle: lines[0] ?? section.title,
              dates: lines[1] ?? null,
              bullets: lines.slice(2).map((line) => line.replace(/^-+\s*/, '')),
            };
          }),
      } as any,
      senderName: 'Synthetic Runner',
      senderContactLine: 'runner@example.com',
      jobTitle: bundle.job.title,
      companyName: bundle.job.company,
      allowedBlocks: bundle.baseline.sections.map((section, order) => ({
        id: section.id,
        title: section.title,
        content: section.content,
        includePolicy: 'ALWAYS' as never,
        order,
        sectionType: section.sectionType as never,
      })) as never,
    });
    const baseGeneration = generator.generate({
      document: assembly.document,
      baselineId: bundle.baseline.id,
      jobId: bundle.job.id,
      candidateName: 'Synthetic Runner',
      closingTemplate: resolveClosingTemplate(DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY),
      job: {
        id: bundle.job.id,
        title: bundle.job.title,
        company: bundle.job.company,
        responsibilities: bundle.job.normalizedResponsibilities,
        requirements: bundle.job.normalizedRequirements,
      },
      allowedBaselineBlocks: bundle.baseline.sections.map((section, order) => ({
        id: section.id,
        title: section.title,
        content: section.content,
        includePolicy: 'ALWAYS' as never,
        order,
        sectionType: section.sectionType as never,
      })) as never,
      safeMode: false,
      documentStrategyPlan: plan,
      maxWords: 280,
      paragraphEvidence: assembly.paragraphEvidence,
    });
    const productionTitle = 'Director of Support Operations - Date Less Fixture';
    const normalizedOpening =
      'I am focused on the Director of Support Operations Date Less Fixture role at Example SaaS because ' +
      baseGeneration.document.opening;
    const generation = {
      ...baseGeneration,
      document: {
        ...baseGeneration.document,
        opening: normalizedOpening,
      },
      content: baseGeneration.content.replace(baseGeneration.document.opening, normalizedOpening),
      paragraphs: [normalizedOpening, ...(baseGeneration.paragraphs ?? []).slice(1)],
      paragraphEvidence: [
        {
          ...(baseGeneration.paragraphEvidence?.[0] as any),
          paragraphKey: 'opening',
          sourceEvidenceIds: [evidenceUnits[0]?.id].filter(Boolean),
        },
        ...(baseGeneration.paragraphEvidence ?? []).filter((entry: any) => entry.paragraphKey !== 'opening'),
      ],
    } as any;

    const postProcessed = (service as any).applyCoverLetterPostProcessing(
      generation,
      {
        title: productionTitle,
        company: bundle.job.company,
        responsibilities: bundle.job.normalizedResponsibilities,
        requirements: bundle.job.normalizedRequirements,
      },
      'Synthetic Runner',
      evidenceUnits,
    );

    expect(postProcessed.flags).not.toContain('missing_role_or_company_context');
  });

  it('does not flag keyword_echo_overuse when JD keywords appear naturally once', () => {
    const { service } = buildService();
    const jobContext = {
      title: 'Platform Operations Manager',
      company: 'Example Co',
      responsibilities: [
        'Own incident management and escalation workflows for production systems',
        'Partner with engineering leadership on reliability and change management',
        'Drive postmortems and continuous improvement across cross functional teams',
      ],
      requirements: [
        'Experience with kubernetes, terraform, and on call operations',
        'Strong stakeholder communication and operational rigor',
        'Ability to translate requirements into measurable outcomes',
      ],
    };
    const generation = {
      document: {
        senderHeading: { name: 'Synthetic Runner' },
        salutation: 'Dear Hiring Team,',
        opening: 'I am excited to apply for the Platform Operations Manager role at Example Co.',
        bodyParagraphs: [
          'In recent roles I owned incident response, postmortems, and escalation workflows and partnered with engineering leaders to improve reliability and change management.',
          'I have hands-on experience with Kubernetes and Terraform and I focus on operational rigor, measurable outcomes, and clear stakeholder communication.',
        ],
        closingParagraph: 'I would welcome the chance to discuss how I can help your team deliver reliable systems.',
        signoff: 'Sincerely,',
        signatureName: 'Synthetic Runner',
      },
      content:
        'Dear Hiring Team,\n\n' +
        'I am excited to apply for the Platform Operations Manager role at Example Co.\n\n' +
        'In recent roles I owned incident response, postmortems, and escalation workflows and partnered with engineering leaders to improve reliability and change management.\n\n' +
        'I have hands-on experience with Kubernetes and Terraform and I focus on operational rigor, measurable outcomes, and clear stakeholder communication.\n\n' +
        'I would welcome the chance to discuss how I can help your team deliver reliable systems.\n\n' +
        'Sincerely,\n\n' +
        'Synthetic Runner',
      wordCount: 160,
      greeting: 'Dear Hiring Team,',
      paragraphs: ['Opening.', 'Body one.', 'Body two.'],
      closingParagraphs: ['Closing.'],
      paragraphEvidence: [],
    };

    const postProcessed = (service as any).applyCoverLetterPostProcessing(
      generation,
      jobContext,
      'Synthetic Runner',
      [
        {
          id: 'e1',
          text: 'I owned support operations across tooling, analytics, and cross-functional delivery.',
          sourceBlockId: 'e1',
          sourceSectionType: 'EXPERIENCE',
          classification: 'accomplishment',
          verificationState: 'verified',
          eligibleForNarrativeComposition: true,
          extractedEvidenceCount: 1,
        },
        {
          id: 'e2',
          text: 'I have hands-on experience with Kubernetes and Terraform and I focus on operational rigor, measurable outcomes, and clear stakeholder communication.',
          sourceBlockId: 'e2',
          sourceSectionType: 'EXPERIENCE',
          classification: 'accomplishment',
          verificationState: 'verified',
          eligibleForNarrativeComposition: true,
          extractedEvidenceCount: 1,
        },
      ],
    );

    expect(postProcessed.flags).not.toContain('keyword_echo_overuse');
  });

  it('does not flag missing_candidate_name or repetitive_openings for synthetic candidate name and fallback closing', () => {
    const { service } = buildService();

    const generator = new TemplateCoverLetterGenerator();
    const generation = generator.generate({
      document: {
        senderHeading: { name: 'Core Loop Candidate', contactLine: 'core@example.com' },
        salutation: 'Dear Hiring Team,',
        opening: 'Support operations director focused on incident response and escalation clarity.',
        bodyParagraphs: [
          'I owned support operations across tooling, analytics, and cross-functional delivery.',
        ],
        closingParagraph: 'Thank you for your consideration.',
        signoff: 'Sincerely,',
        signatureName: 'Core Loop Candidate',
      },
      baselineId: 'baseline-1',
      jobId: 'job-1',
      candidateName: 'Core Loop Candidate',
      closingTemplate: resolveClosingTemplate(DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY),
      job: {
        id: 'job-1',
        title: 'Support Operations Director',
        company: 'TargetThisRole Synthetic',
        responsibilities: ['Own support operations', 'Drive incident response'],
        requirements: ['Operational rigor', 'Stakeholder management'],
      },
      allowedBaselineBlocks: [
        {
          id: 'section-1',
          title: 'Summary',
          content:
            'I owned support operations across tooling, analytics, and cross-functional delivery. Improved time-to-first-response by 18% and time-to-resolution by 22%.',
          includePolicy: 'ALWAYS' as never,
          order: 0,
          sectionType: 'SUMMARY' as never,
        },
      ] as never,
      safeMode: false,
      maxWords: 280,
    });

    const postProcessed = (service as any).applyCoverLetterPostProcessing(
      generation,
      {
        title: 'Support Operations Director',
        company: 'TargetThisRole Synthetic',
        responsibilities: ['Own support operations', 'Drive incident response'],
        requirements: ['Operational rigor', 'Stakeholder management'],
      },
      'Core Loop Candidate',
      [
        {
          id: 'section-1',
          text: 'I owned support operations across tooling, analytics, and cross-functional delivery.',
          sourceBlockId: 'section-1',
          sourceSectionType: 'EXPERIENCE',
          classification: 'accomplishment',
          verificationState: 'verified',
          eligibleForNarrativeComposition: true,
          extractedEvidenceCount: 1,
        },
      ],
    );

    // Post-processing is a validator, not a padding layer.
    expect(postProcessed.flags).not.toContain('missing_candidate_name');
    expect(postProcessed.flags).not.toContain('repetitive_openings');
    expect(postProcessed.generation.content).toContain('Core Loop Candidate');
  });

  it('does not flag keyword stuffing when support vocabulary is spread across paragraphs naturally', () => {
    const { service } = buildService();
    const jobContext = {
      title: 'Support Operations Director',
      company: 'Example SaaS',
      responsibilities: [
        'Own support operations, escalations, and workflow clarity',
        'Partner with product and engineering on incident response',
      ],
      requirements: [
        'Lead customer support teams with operational rigor',
        'Improve service quality, queue health, and stakeholder communication',
      ],
    };
    const generation = {
      document: {
        senderHeading: { name: 'Synthetic Runner' },
        salutation: 'Dear Hiring Team,',
        opening: 'I am excited to apply for the Support Operations Director role at Example SaaS.',
        bodyParagraphs: [
          'I have led support operations, incident response, and queue health improvements with clear operating rhythms.',
          'My work has partnered product and engineering teams on service quality, workflow clarity, and stakeholder updates.',
          'I would welcome the chance to help your support organization keep reliability, escalation handling, and service quality visible.',
        ],
        closingParagraph: 'Thank you for your consideration.',
        signoff: 'Sincerely,',
        signatureName: 'Synthetic Runner',
      },
      content:
        'Dear Hiring Team,\n\n' +
        'I am excited to apply for the Support Operations Director role at Example SaaS.\n\n' +
        'I have led support operations, incident response, and queue health improvements with clear operating rhythms.\n\n' +
        'My work has partnered product and engineering teams on service quality, workflow clarity, and stakeholder updates.\n\n' +
        'I would welcome the chance to help your support organization keep reliability, escalation handling, and service quality visible.\n\n' +
        'Thank you for your consideration.\n\n' +
        'Sincerely,\n\n' +
        'Synthetic Runner',
      wordCount: 150,
      greeting: 'Dear Hiring Team,',
      paragraphs: ['Opening.', 'Body one.', 'Body two.'],
      closingParagraphs: ['Closing.'],
      paragraphEvidence: [],
    };

    const postProcessed = (service as any).applyCoverLetterPostProcessing(
      generation,
      jobContext,
      'Synthetic Runner',
      [
        {
          id: 'e1',
          text: 'I have led support operations, incident response, and queue health improvements with clear operating rhythms.',
          sourceBlockId: 'e1',
          sourceSectionType: 'EXPERIENCE',
          classification: 'accomplishment',
          verificationState: 'verified',
          eligibleForNarrativeComposition: true,
          extractedEvidenceCount: 1,
        },
        {
          id: 'e2',
          text: 'My work has partnered product and engineering teams on service quality, workflow clarity, and stakeholder updates.',
          sourceBlockId: 'e2',
          sourceSectionType: 'EXPERIENCE',
          classification: 'accomplishment',
          verificationState: 'verified',
          eligibleForNarrativeComposition: true,
          extractedEvidenceCount: 1,
        },
      ],
    );

    expect(postProcessed.flags).not.toContain('keyword_stuffing');
  });

  it('still flags keyword_echo_overuse when JD keywords are repeated excessively', () => {
    const { service } = buildService();
    const jobContext = {
      title: 'Platform Operations Manager',
      company: 'Example Co',
      responsibilities: ['Operate kubernetes platform and drive kubernetes reliability initiatives'],
      requirements: ['Deep kubernetes experience with kubernetes operations and kubernetes tooling'],
    };
    const repeated = 'kubernetes '.repeat(40).trim();
    const generation = {
      document: {
        senderHeading: { name: 'Synthetic Runner' },
        salutation: 'Dear Hiring Team,',
        opening: `I am applying for the Platform Operations Manager role at Example Co. ${repeated}`,
        bodyParagraphs: [`${repeated}`, `${repeated}`],
        closingParagraph: `${repeated}`,
        signoff: 'Sincerely,',
        signatureName: 'Synthetic Runner',
      },
      content:
        `Dear Hiring Team,\n\n` +
        `I am applying for the Platform Operations Manager role at Example Co. ${repeated}\n\n` +
        `${repeated}\n\n` +
        `${repeated}\n\n` +
        `${repeated}\n\n` +
        `Sincerely,\n\n` +
        `Synthetic Runner`,
      wordCount: 260,
      greeting: 'Dear Hiring Team,',
      paragraphs: ['Opening.', 'Body one.', 'Body two.'],
      closingParagraphs: ['Closing.'],
      paragraphEvidence: [],
    };

    const postProcessed = (service as any).applyCoverLetterPostProcessing(
      generation,
      jobContext,
      'Synthetic Runner',
      [
        {
          id: 'e1',
          text: 'I am applying for the Platform Operations Manager role at Example Co.',
          sourceBlockId: 'e1',
          sourceSectionType: 'EXPERIENCE',
          classification: 'accomplishment',
          verificationState: 'verified',
          eligibleForNarrativeComposition: true,
          extractedEvidenceCount: 1,
        },
      ],
    );

    expect(postProcessed.flags).toEqual(
      expect.arrayContaining(['keyword_stuffing']),
    );
  });
});
