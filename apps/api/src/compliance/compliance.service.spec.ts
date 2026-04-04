import { ComplianceService } from './compliance.service';
import {
  ComplianceAction,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
  GeneratedTextSourceType,
} from './compliance.types';
import { BaselineSectionType } from '../baseline/baseline-section.entity';

const buildAuditRepo = () => {
  const create = jest.fn((payload) => payload);
  const save = jest.fn(async (payload) => ({
    id: 'audit-1',
    createdAt: new Date(),
    ...payload,
  }));

  return { create, save };
};

describe('ComplianceService', () => {
  const repoMock = buildAuditRepo();
  const embeddingServiceMock = {
    embed: jest.fn().mockResolvedValue(null),
  };
  const job = { id: 'job-1', title: 'Support Manager', company: 'Acme' };
  const baselineVersionWithHash = { id: 'baseline-v2', hash: 'hash-2' };
  const service = new ComplianceService(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: manual repository injection
    repoMock,
    embeddingServiceMock as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves line breaks when normalizing section content', () => {
    const sections = service.normalizeSectionsForOutput([
      {
        title: 'Experience',
        content: 'Senior I/O Engineer\nGenoa Healthcare, August 2019 – March 2025\n• Built CI/CD pipelines.',
      },
    ]);

    expect(sections[0]?.content).toContain('Senior I/O Engineer\nGenoa Healthcare');
    expect(sections[0]?.content).toContain('\n• Built CI/CD pipelines.');
  });

  it('flags stylized dash punctuation without mutating content', () => {
    const flags = service.enforceResumeWritingRules({
      rawContent: 'Delivered impact — and scale.',
    });

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.STYLIZED_PUNCTUATION,
        severity: ComplianceFlagSeverity.BLOCK,
      }),
    ]);
  });

  it('persists audit metadata with baseline version details', async () => {
    const baselineVersion = { id: 'bv-1', hash: 'hash-1' };

    const result = await service.validateAndAudit({
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-1',
      baselineVersion,
      job,
      outputHash: 'out-123',
    });

    expect(repoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        action: ComplianceAction.RESUME_GENERATION,
        baselineVersionId: 'bv-1',
        baselineVersionHash: 'hash-1',
        jobId: 'job-1',
        outputHash: 'out-123',
        passFail: true,
      }),
    );
    expect(result.audit).toEqual(
      expect.objectContaining({
        id: 'audit-1',
        baselineVersionId: 'bv-1',
        baselineVersionHash: 'hash-1',
        jobId: 'job-1',
      }),
    );
    expect(result.blocked).toBe(false);
  });

  it('blocks when baseline version context is missing for guarded actions', async () => {
    const result = await service.validateAndAudit({
      action: ComplianceAction.COVER_LETTER_GENERATION,
      actorId: 'user-2',
      outputHash: 'out-999',
    });

    const codes = result.complianceFlags.map((flag) => flag.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        ComplianceFlagCode.MISSING_BASELINE_VERSION,
        ComplianceFlagCode.MISSING_BASELINE_HASH,
      ]),
    );
    expect(result.blocked).toBe(true);
    expect(repoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        passFail: false,
        baselineVersionId: null,
      }),
    );
  });

  it('returns structured compliance trace details when debugCompliance is enabled', async () => {
    const result = await service.validateAndAudit({
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-debug',
      baselineVersion: baselineVersionWithHash,
      outputHash: 'out-debug',
      debugCompliance: true,
      baselineSections: [
        {
          title: 'Professional Experience',
          content: 'Senior Support Manager at Acme\nLed support operations.',
          sectionType: BaselineSectionType.EXPERIENCE,
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        },
      ],
      generatedSections: [
        {
          title: 'Chief Moonshot Officer',
          content: 'My role was Chief Moonshot Officer at Acme.',
          sectionType: BaselineSectionType.EXPERIENCE,
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          sentenceSources: [
            {
              text: 'Chief Moonshot Officer',
              sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
            },
            {
              text: 'My role was Chief Moonshot Officer at Acme.',
              sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
            },
          ],
        },
      ],
    });

    expect(result.debugTrace?.enabled).toBe(true);
    expect(result.debugTrace?.appliedRules.length).toBeGreaterThan(0);
    expect(result.debugTrace?.evaluatedLines.some((line) =>
      line.sourceText.includes('Chief Moonshot Officer'),
    )).toBe(true);
  });

  describe('policy map enforcement', () => {
    it('downgrades technology flags below block threshold', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-policy',
        baselineVersion: { id: 'bv-1', hash: 'hash-1' },
        job: { id: 'job-1' },
        outputHash: 'out-policy',
        baselineSections: [],
        generatedSections: [],
        extraFlags: [
          {
            code: ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
            severity: ComplianceFlagSeverity.BLOCK,
            message: 'Suspect technology',
            confidence: 0.6,
          },
        ],
      });

      const techFlag = result.complianceFlags.find(
        (flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
      );
      expect(techFlag).toBeDefined();
      expect(techFlag?.severity).toBe(ComplianceFlagSeverity.WARN);
      expect(result.blocked).toBe(false);
    });

    it('blocks technology flags that meet the confidence threshold', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-policy-block',
        baselineVersion: { id: 'bv-1', hash: 'hash-1' },
        job: { id: 'job-1' },
        outputHash: 'out-policy-block',
        baselineSections: [],
        generatedSections: [],
        extraFlags: [
          {
            code: ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
            severity: ComplianceFlagSeverity.WARN,
            message: 'Suspect technology',
            confidence: 0.92,
          },
        ],
      });

      const techFlag = result.complianceFlags.find(
        (flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
      );
      expect(techFlag).toBeDefined();
      expect(techFlag?.severity).toBe(ComplianceFlagSeverity.BLOCK);
      expect(result.blocked).toBe(true);
    });
  });

  describe('invented company and role detection', () => {
    const jobWithTitle = { ...job, title: 'Product Manager' };

    it('blocks invented company references not in the baseline', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-company',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-company',
        baselineSections: [
          { title: 'Experience', content: 'Delivered impact at Example Co.' },
        ],
        generatedSections: [
          { title: 'Experience', content: 'Enabled growth at Horizon Labs.' },
        ],
      });

      expect(result.blocked).toBe(true);
      expect(result.complianceFlags.map((flag) => flag.code)).toContain(
        ComplianceFlagCode.INVENTED_COMPANY,
      );
    });

    it('blocks invented role references not seen in baseline or job', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-role',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-role',
        baselineSections: [
          {
            title: 'Experience',
            content: 'Served as Software Engineer managing releases.',
          },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content: 'Discussed the Chief Innovation Strategist role.',
          },
        ],
      });

      expect(result.blocked).toBe(true);
      expect(result.complianceFlags.map((flag) => flag.code)).toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });

    it('skips invented detectors for non-baseline source types', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-source-gate',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-source-gate',
        baselineSections: [
          {
            title: 'Experience',
            content: 'Served as Software Engineer.',
          },
        ],
        generatedSections: [
          {
            title: 'Cover Letter',
            content:
              'Your posting for a Senior Network Infrastructure Engineer requires deep systems expertise.',
            sourceType: GeneratedTextSourceType.JD_REFERENCE,
            sentenceSources: [
              {
                text: 'Your posting for a Senior Network Infrastructure Engineer requires deep systems expertise.',
                sourceType: GeneratedTextSourceType.JD_REFERENCE,
              },
            ],
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_COMPANY,
      );
    });

    it('allows allowlisted role phrases such as hiring manager', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.COVER_LETTER_GENERATION,
        actorId: 'user-allowlist',
        baselineVersion: baselineVersionWithHash,
        job: jobWithTitle,
        outputHash: 'out-allowlist',
        generatedSections: [
          {
            title: 'Cover Letter',
            content:
              'Thank you to the hiring manager and interview panel for their time.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });

    it('allows references to the job role when the job title matches', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.FOLLOW_UP_GENERATION,
        actorId: 'user-job-role',
        baselineVersion: baselineVersionWithHash,
        job: jobWithTitle,
        outputHash: 'out-job-role',
        generatedSections: [
          {
            title: 'Follow Up',
            content: 'I appreciated discussing the Product Manager role.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });

    it('allows baseline company references to persist', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: 'user-baseline',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-baseline-company',
        baselineSections: [
          { title: 'Experience', content: 'Led a team at Example Co.' },
        ],
        generatedSections: [
          { title: 'Experience', content: 'Led a team at Example Co.' },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_COMPANY,
      );
    });

    it('allows baseline role references to persist', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: 'user-baseline-role',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-baseline-role',
        baselineSections: [
          { title: 'Experience', content: 'Served as Principal Designer.' },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content: 'Solidified experience as Principal Designer role.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });

    it('ignores prose fragments that mention a baseline title with common lead-ins', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-baseline-fragment',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-baseline-fragment',
        baselineSections: [
          {
            title: 'Experience',
            content: 'Served as Senior Manager focusing on CX.',
          },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content:
              'confidence. Experience Senior Manager with deep customer success experience.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });

    it('still blocks clearly invented titles even when prose lead-ins exist', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-invented-role',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-invented-role',
        baselineSections: [
          { title: 'Experience', content: 'Served as Software Engineer.' },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content:
              'Experience VP of Galactic Support overseeing interplanetary missions.',
          },
        ],
      });

      expect(result.blocked).toBe(true);
      expect(result.complianceFlags.map((flag) => flag.code)).toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });

    it('treats punctuation, suffix, and mixed-case variants of baseline companies as the same', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: 'user-company-variants',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-company-variants',
        baselineSections: [
          {
            sectionType: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: 'Guided strategy at Example, Inc.',
          },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content: 'Shared wins at example inc llc.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_COMPANY,
      );
    });

    it('does not block reward phrases such as real world merchandise', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-reward-phrases',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-reward-phrases',
        generatedSections: [
          {
            title: 'Experience',
            content:
              'Recognized top performers with real world merchandise and customer rewards.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_COMPANY,
      );
    });

    it('does not block gift card references as invented companies', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-gift-cards',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-gift-cards',
        generatedSections: [
          {
            title: 'Experience',
            content:
              'Operated customer recovery programs that included gift cards and electronics.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_COMPANY,
      );
    });

    it('does not treat salary text as fabricated employer evidence', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-salary-text',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-salary-text',
        generatedSections: [
          {
            title: 'Experience',
            content:
              'Compensation range was $110,000 - $145,000 plus bonus and equity.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_COMPANY,
      );
    });

    it('recognizes seniority modifiers in baseline summaries so case-insensitive matches are allowed', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-seniority',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-seniority',
        baselineSections: [
          {
            sectionType: BaselineSectionType.SUMMARY,
            title: 'Summary',
            content:
              'Senior Product Manager driving clarity for product launches.',
          },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content:
              'I served as a senior product manager coordinating global launches.',
          },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });
  });

  describe('invented metric detection', () => {
    type MetricScenario = {
      name: string;
      generated: string;
      baselineSections?: Array<{
        sectionType: BaselineSectionType;
        title?: string;
        content: string;
      }>;
      expectBlock: boolean;
    };

    const metricScenarios: MetricScenario[] = [
      {
        name: 'blocks new backlog metric without baseline',
        generated: 'Reduced backlog by 30 percent in a single quarter.',
        expectBlock: true,
      },
      {
        name: 'blocks SLA uptime claim missing baseline',
        generated: 'Delivered SLA of 99.9% uptime for 30 days.',
        expectBlock: true,
      },
      {
        name: 'blocks CSAT improvement outside baseline',
        generated: 'Increased CSAT to 80% across the team.',
        expectBlock: true,
      },
      {
        name: 'blocks revenue claim outside baseline',
        generated: 'Achieved revenue of 450000 last quarter.',
        expectBlock: true,
      },
      {
        name: 'allows existing CSAT from baseline',
        generated: 'Improved CSAT to 80% across the team.',
        baselineSections: [
          {
            sectionType: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: 'Improved CSAT to 80% across the team.',
          },
        ],
        expectBlock: false,
      },
      {
        name: 'allows ISO 27001 certification mention',
        generated: 'Achieved ISO 27001 certification and documentation.',
        expectBlock: false,
      },
      {
        name: 'allows 24/7 support mention',
        generated: 'Delivered 24/7 response for critical incidents.',
        expectBlock: false,
      },
      {
        name: 'allows year reference even with backlog context',
        generated: 'Delivered backlog improvements in 2023.',
        expectBlock: false,
      },
      {
        name: 'allows tier reference despite tickets context',
        generated: 'Improved Tier 1 ticket response with dedicated coverage.',
        expectBlock: false,
      },
      {
        name: 'allows phone number mention near metric words',
        generated:
          'Delivered ticket follow-up and recorded 555-123-4567 for the support team.',
        expectBlock: false,
      },
      {
        name: 'blocks spelled-out backlog metric without baseline',
        generated:
          'Reduced backlog by ten percent after launching the intake review.',
        expectBlock: true,
      },
      {
        name: 'allows spelled number outside metric context',
        generated: 'Collaborated with a team of ten engineers.',
        expectBlock: false,
      },
      {
        name: 'allows spelled metric already in baseline',
        generated: 'Improved SLA to ten percent for the operational team.',
        baselineSections: [
          {
            sectionType: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: 'Improved SLA to ten percent for the operational team.',
          },
        ],
        expectBlock: false,
      },
    ];

    for (const scenario of metricScenarios) {
      it(`${scenario.name}`, async () => {
        const result = await service.validateAndAudit({
          action: ComplianceAction.RESUME_GENERATION,
          actorId: `user-metric-${scenario.name.replace(/\s+/g, '-')}`,
          baselineVersion: baselineVersionWithHash,
          outputHash: `out-metric-${scenario.name.replace(/\s+/g, '-')}`,
          baselineSections: scenario.baselineSections,
          generatedSections: [
            {
              title: 'Experience',
              content: scenario.generated,
            },
          ],
        });

        const codes = result.complianceFlags.map((flag) => flag.code);

        if (scenario.expectBlock) {
          expect(result.blocked).toBe(true);
          expect(codes).toContain(ComplianceFlagCode.INVENTED_METRIC);
        } else {
          expect(result.blocked).toBe(false);
          expect(codes).not.toContain(ComplianceFlagCode.INVENTED_METRIC);
        }
      });
    }
  });

  describe('fictional technology detection', () => {
    it('blocks generated technology tokens not present in the baseline', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-tech',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-tech-1',
        baselineSections: [
          {
            title: 'Experience',
            content: 'Managed PostgreSQL and AWS migrations.',
          },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content: 'Built the ImaginaryDB control plane.',
          },
        ],
      });

      const flags = result.complianceFlags.map((flag) => flag.code);
      const message = result.complianceFlags.find(
        (flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
      )?.message;

      expect(result.blocked).toBe(true);
      expect(flags).toContain(ComplianceFlagCode.FICTIONAL_TECHNOLOGY);
      expect(message).toContain('ImaginaryDB');
    });

    it('allows reuse of baseline technology tokens', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_GENERATION,
        actorId: 'user-tech-baseline',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-tech-2',
        baselineSections: [
          {
            title: 'Experience',
            content: 'Led ImaginaryDB automation for multiple releases.',
          },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content: 'Scaled ImaginaryDB automation globally.',
          },
        ],
      });

      const flags = result.complianceFlags.map((flag) => flag.code);

      expect(result.blocked).toBe(false);
      expect(flags).not.toContain(ComplianceFlagCode.FICTIONAL_TECHNOLOGY);
    });
  });

  describe('resume export policy behavior', () => {
    it('hard-blocks truth violations for resume export', async () => {
      const result = await service.validateAndAudit({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: 'user-export-policy',
        baselineVersion: baselineVersionWithHash,
        outputHash: 'out-export-policy',
        baselineSections: [
          {
            title: 'Experience',
            content: 'Built services using PostgreSQL and AWS.',
          },
        ],
        generatedSections: [
          {
            title: 'Experience',
            content:
              'Built services using ImaginaryDB and reduced cycle time by ten percent — globally.',
          },
        ],
      });

      const metricFlag = result.complianceFlags.find(
        (flag) => flag.code === ComplianceFlagCode.INVENTED_METRIC,
      );
      const techFlag = result.complianceFlags.find(
        (flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
      );
      const punctuationFlag = result.complianceFlags.find(
        (flag) => flag.code === ComplianceFlagCode.STYLIZED_PUNCTUATION,
      );

      expect(metricFlag?.severity).toBe(ComplianceFlagSeverity.BLOCK);
      expect(techFlag?.severity).toBe(ComplianceFlagSeverity.BLOCK);
      if (punctuationFlag) {
        expect(punctuationFlag.severity).toBe(ComplianceFlagSeverity.WARN);
      }
      expect(result.blocked).toBe(true);
    });
  });
});
