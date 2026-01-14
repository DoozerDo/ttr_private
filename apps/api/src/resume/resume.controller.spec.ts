import { ForbiddenException } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { getEntitlementsForTier } from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

describe('ResumeController tier gating', () => {
  let controller: ResumeController;
  const resumeService = {
    generateResume: jest.fn(),
    exportResume: jest.fn(),
  } as unknown as ResumeService;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ResumeController(resumeService);
  });

  it('rejects FREE tier resume generation with TIER_GATED', async () => {
    const request = {
      user: {
        id: 'user-1',
        entitlements: getEntitlementsForTier(SubscriptionTier.FREE),
      },
    } as any;

    let capturedError: unknown;

    try {
      await controller.generateResume(
        { baselineId: 'baseline-1', baselineVersionId: 'version-1', jobId: 'job-1' },
        request,
      );
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(ForbiddenException);
    expect(capturedError).toMatchObject({
      response: expect.objectContaining({
        errorCode: 'TIER_GATED',
      }),
    });

    expect(resumeService.generateResume).not.toHaveBeenCalled();
  });
});
