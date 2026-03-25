import { UnprocessableEntityException } from '@nestjs/common';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';
import { getEntitlementsForTier } from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';

describe('CoverLettersController generation contract', () => {
  it('surfaces generation_failed as HTTP 422 payload', async () => {
    const service = {
      generateCoverLetter: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          code: 'generation_failed',
          message: 'Cover letter generation failed validation.',
        }),
      ),
    } as unknown as CoverLettersService;

    const controller = new CoverLettersController(service);

    await expect(
      controller.generate(
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'version-1',
          jobId: 'job-1',
          analysisId: 'analysis-1',
        } as any,
        {
          user: {
            id: 'user-1',
            subscriptionTier: SubscriptionTier.PRO,
            entitlements: getEntitlementsForTier(SubscriptionTier.PRO),
          },
        } as any,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'generation_failed',
        message: 'Cover letter generation failed validation.',
      },
      status: 422,
    });
  });
});
