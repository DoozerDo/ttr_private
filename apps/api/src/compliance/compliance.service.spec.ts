import { ComplianceService } from './compliance.service';
import { ComplianceAction, ComplianceFlagCode, ComplianceFlagSeverity } from './compliance.types';

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
  const service = new ComplianceService(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: manual repository injection
    repoMock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
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
    const job = { id: 'job-1' };

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

  describe('invented company and role detection', () => {
    const baselineVersionWithHash = { id: 'baseline-v2', hash: 'hash-2' };
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
          { title: 'Experience', content: 'Served as Software Engineer managing releases.' },
        ],
        generatedSections: [
          { title: 'Experience', content: 'Discussed the Chief Innovation Strategist role.' },
        ],
      });

      expect(result.blocked).toBe(true);
      expect(result.complianceFlags.map((flag) => flag.code)).toContain(
        ComplianceFlagCode.INVENTED_ROLE,
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
            content: 'Thank you to the hiring manager and interview panel for their time.',
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
          { title: 'Experience', content: 'Solidified experience as Principal Designer role.' },
        ],
      });

      expect(result.blocked).toBe(false);
      expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
        ComplianceFlagCode.INVENTED_ROLE,
      );
    });
  });
});
