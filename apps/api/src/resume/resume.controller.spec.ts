import { ForbiddenException } from '@nestjs/common';
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
};

const resumeService = {
  generateResume: jest.fn(),
  exportResume: jest.fn(),
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
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
  } as unknown as Response;
};

describe('ResumeController tier gating', () => {
  let controller: ResumeController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ResumeController(resumeService as ResumeService);
  });

  it('allows FREE tier resume generation', async () => {
    const request = buildRequest(SubscriptionTier.FREE);

    await controller.generateResume(
      {
        baselineId: 'baseline-1',
        baselineVersionId: 'version-1',
        jobId: 'job-1',
      },
      request,
    );

    expect(resumeService.generateResume).toHaveBeenCalled();
  });

  it('blocks FREE tier resume export with TIER_GATED', async () => {
    const request = buildRequest(SubscriptionTier.FREE);
    const res = buildResponse();

    await expect(
      controller.exportResume(
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'version-1',
          jobId: 'job-1',
        },
        request,
        res,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(resumeService.exportResume).not.toHaveBeenCalled();
  });
});
