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
});
