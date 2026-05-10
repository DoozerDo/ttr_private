import { ForbiddenException, HttpStatus, StreamableFile } from '@nestjs/common';
import { UnprocessableEntityException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import {
  getEntitlementsForTier,
  Entitlements,
} from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

type TestTieredResumeRequest = Request & {
  user: {
    id: string;
    subscriptionTier: SubscriptionTier;
    entitlements: Entitlements;
  };
};

type TestResumeService = {
  generateResume: jest.Mock;
  exportResume: jest.Mock;
  getGenerationReadiness: jest.Mock;
};

const resumeService = {
  generateResume: jest.fn(),
  exportResume: jest.fn(),
  getGenerationReadiness: jest.fn(),
} satisfies TestResumeService;

function ensureRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected an object');
  }
}

function assertStringProp(record: Record<string, unknown>, key: string): void {
  if (typeof record[key] !== 'string') {
    throw new Error(`Expected ${key} to be a string`);
  }
}

function assertTieredResumeRequest(
  value: unknown,
): asserts value is TestTieredResumeRequest {
  ensureRecord(value);
  if (!value.user) {
    throw new Error('Request missing user');
  }
  ensureRecord(value.user);
  assertStringProp(value.user, 'id');
  const user = value.user as TestTieredResumeRequest['user'];
  if (!user.entitlements) {
    user.entitlements = getEntitlementsForTier(SubscriptionTier.FREE);
  }
}

const buildRequest = (tier: SubscriptionTier): TestTieredResumeRequest => {
  const candidate: Partial<TestTieredResumeRequest> = {
    user: {
      id: 'user-1',
      subscriptionTier: tier,
      entitlements: getEntitlementsForTier(tier),
    },
  };
  assertTieredResumeRequest(candidate);
  return candidate;
};

const buildResponse = (): Response => {
  const response: Partial<Response> = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  return response as Response;
};

describe('ResumeController readiness (informational-only)', () => {
  it('returns 200 readiness payload when service throws UnprocessableEntityException', async () => {
    const controller = new ResumeController(resumeService as unknown as ResumeService);
    const request = buildRequest(SubscriptionTier.PRO);

    resumeService.getGenerationReadiness.mockImplementationOnce(async () => {
      throw new UnprocessableEntityException({
        error: { code: 'baseline_resume_v2_missing', message: 'Baseline ResumeV2 missing' },
      });
    });

    const payload = await controller.getGenerationReadiness(
      { baselineId: 'base-1', baselineVersionId: 'basev-1', jobId: 'job-1', analysisId: 'analysis-1' } as any,
      request as any,
    );

    expect(payload).toMatchObject({
      status: 'blocked',
      blocked: true,
      reasons: [{ code: 'baseline_resume_v2_missing' }],
    });
  });
});

describe('ResumeController tier gating', () => {
  let controller: ResumeController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ResumeController(resumeService as ResumeService);
  });

  it('allows FREE tier resume generation', async () => {
    const request = buildRequest(SubscriptionTier.FREE);
    resumeService.generateResume.mockResolvedValue({
      ok: true,
      status: 'success',
      generationStatus: 'success',
      exportReady: true,
      blocked: false,
      baselineId: 'baseline-1',
      baselineVersionId: 'version-1',
      jobId: 'job-1',
      sections: [],
      compliance_flags: [],
      compliance_blocked: false,
      audit_id: 'audit-1',
      auditId: 'audit-1',
      baseline_version_hash: 'hash-1',
      quality: 'draft',
      traceMap: { opening: ['e1'] },
      debugTrace: {
        passed: true,
        failures: [],
        traceCoverage: 100,
        unusedEvidence: [],
        selectedEvidence: ['e1'],
      },
      exports: { docx: false, pdf: false },
      preview: { resume: null },
      trackerEntryId: null,
      trackerStatus: null,
      opportunityId: null,
      claimRiskSummary: null,
      gapAnalysis: null,
      gapGuidance: null,
      display: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
      safeDisplay: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
      internal: {},
    });

    const result = await controller.generateResume(
      {
        baselineId: 'baseline-1',
        baselineVersionId: 'version-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
      },
      request,
    );

    expect(resumeService.generateResume).toHaveBeenCalled();
    expect(result.traceMap).toEqual({ opening: ['e1'] });
    expect(result.debugTrace.selectedEvidence).toEqual(['e1']);
  });

  it('routes POST /resume (alias) through the same generation service handler as POST /resume/generate', async () => {
    const request = buildRequest(SubscriptionTier.FREE);

    resumeService.generateResume.mockResolvedValueOnce({
      ok: true,
      status: 'success',
      generationStatus: 'success',
      exportReady: true,
      blocked: false,
      baselineId: 'baseline-1',
      baselineVersionId: 'version-1',
      jobId: 'job-1',
      sections: [],
      compliance_flags: [],
      compliance_blocked: false,
      audit_id: 'audit-1',
      auditId: 'audit-1',
      baseline_version_hash: 'hash-1',
      quality: 'draft',
      traceMap: { opening: ['e1'] },
      debugTrace: {
        passed: true,
        failures: [],
        traceCoverage: 100,
        unusedEvidence: [],
        selectedEvidence: ['e1'],
      },
      exports: { docx: false, pdf: false },
      preview: { resume: null },
      trackerEntryId: null,
      trackerStatus: null,
      opportunityId: null,
      claimRiskSummary: null,
      gapAnalysis: null,
      gapGuidance: null,
      display: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
      safeDisplay: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
      internal: {},
    });

    const result = await controller.createResumeRequest(
      {
        baselineId: 'baseline-1',
        baselineVersionId: 'version-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
      },
      request,
    );

    expect(resumeService.generateResume).toHaveBeenCalledTimes(1);
    expect(result.traceMap).toEqual({ opening: ['e1'] });
    expect(result.debugTrace.selectedEvidence).toEqual(['e1']);
  });

  it('blocks FREE tier resume export with TIER_REQUIRED', async () => {
    const request = buildRequest(SubscriptionTier.FREE);
    const res = buildResponse();

    let caughtError: unknown;
    try {
      await controller.exportResume(
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'version-1',
          jobId: 'job-1',
          analysisId: 'analysis-1',
        },
        request,
        res,
      );
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ForbiddenException);
    const forbiddenError = caughtError as ForbiddenException & { getResponse: () => unknown };
    expect(forbiddenError.getResponse()).toMatchObject({
      code: 'TIER_REQUIRED',
      message: 'Upgrade to Pro to download documents.',
      details: {
        requiredTier: SubscriptionTier.PRO,
        currentTier: SubscriptionTier.FREE,
        feature: 'EXPORT_RESUME',
      },
    });
    expect(resumeService.exportResume).not.toHaveBeenCalled();
  });

  it('allows PRO tier resume export and forwards the file', async () => {
    const request = buildRequest(SubscriptionTier.PRO);
    const res = buildResponse();
    const file = {
      buffer: Buffer.from('data'),
      contentType: 'application/pdf',
      filename: 'resume.pdf',
      auditId: 'audit-1',
      baselineVersionHash: 'hash-1',
    };
    resumeService.exportResume.mockResolvedValue(file);

    const result = await controller.exportResume(
      {
        baselineId: 'baseline-1',
        baselineVersionId: 'version-1',
        jobId: 'job-1',
        analysisId: 'analysis-1',
      },
      request,
      res,
    );

    expect(resumeService.exportResume).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Compliance-Audit-Id', file.auditId);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Baseline-Version-Hash',
      file.baselineVersionHash,
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(res.send).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
