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

  it('allows FREE tier resume generation', async () => {
    const request = {
      user: {
        id: 'user-1',
        entitlements: getEntitlementsForTier(SubscriptionTier.FREE),
      },
    } as any;

    await controller.generateResume(
      { baselineId: 'baseline-1', baselineVersionId: 'version-1', jobId: 'job-1' },
      request,
    );

    expect(resumeService.generateResume).toHaveBeenCalled();
  });

  it('blocks FREE tier resume export with TIER_GATED', async () => {
    const request = {
      user: {
        id: 'user-1',
        entitlements: getEntitlementsForTier(SubscriptionTier.FREE),
      },
    } as any;
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await expect(
      controller.exportResume(
        { baselineId: 'baseline-1', baselineVersionId: 'version-1', jobId: 'job-1' },
        request,
        res,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(resumeService.exportResume).not.toHaveBeenCalled();
  });
});
