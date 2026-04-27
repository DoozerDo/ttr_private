import { DataSource } from 'typeorm';
import { CoverLettersService } from './cover-letters.service';
import { ComplianceAction } from '../compliance/compliance.types';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { buildDocumentStrategyPlan } from '../shared/documentStrategyPlan';
import { listSyntheticGenerationScenarioBundles } from '../synthetic/generation/synthetic-generation.fixtures';
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
    const generation = generator.generate({
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
    );

    expect(postProcessed.flags).toEqual([]);
    expect(postProcessed.generation.content).toContain('Dear Hiring Team,');
    expect(postProcessed.generation.content).toContain('Sincerely,');
    expect(postProcessed.generation.content).not.toMatch(/Explain why|opening proof point|line-by-line recap/i);
    expect(postProcessed.generation.content).not.toContain('-');
    expect(postProcessed.generation.content.split(/\n\s*\n/)).toHaveLength(7);
    expect(postProcessed.generation.document.bodyParagraphs).toHaveLength(2);
    expect(postProcessed.generation.document.closingParagraph).toBeTruthy();
    expect(postProcessed.generation.document.bodyParagraphs.every((paragraph) => paragraph.split(/\s+/).length <= 130)).toBe(true);
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
    );

    expect(postProcessed.flags).not.toContain('keyword_echo_overuse');
  });

  it('does not flag missing_candidate_name or repetitive_openings for synthetic candidate name and fallback closing', () => {
    const { service } = buildService();

    const generator = new TemplateCoverLetterGenerator();
    const generation = generator.generate({
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
            'Owned support operations across tooling, analytics, and cross-functional delivery. Improved time-to-first-response by 18% and time-to-resolution by 22%.',
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
    );

    expect(postProcessed.flags).toEqual([]);
    expect(postProcessed.generation.content).toContain('Core Loop Candidate');
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
    );

    expect(postProcessed.flags).toEqual(
      expect.arrayContaining(['keyword_stuffing']),
    );
  });
});
