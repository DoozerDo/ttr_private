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

  it('returns trace audit fields from the generate endpoint', async () => {
    const service = {
      generateCoverLetter: jest.fn().mockResolvedValue({
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        id: 'cover-1',
        userId: 'user-1',
        jobId: 'job-1',
        baselineId: 'baseline-1',
        generatorType: 'template',
        generatorVersion: 'v1',
        closingTemplateKey: 'steady',
        content: 'Dear Hiring Team,\n\nOpening.\n\nBody.\n\nClosing.\n\nSincerely,\n\nCandidate',
        generationInputsHash: 'hash-1',
        isSynthetic: false,
        syntheticScenarioKey: null,
        syntheticRunId: null,
        syntheticCreatedAt: null,
        preserveFromCleanup: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        preview: { coverLetter: { salutation: 'Dear Hiring Team,' } },
        compliance_flags: [],
        audit_id: 'audit-1',
        auditId: 'audit-1',
        baseline_version_hash: 'hash-1',
        traceMap: { opening: ['e1'] },
        debugTrace: {
          passed: true,
          failures: [],
          traceCoverage: 100,
          unusedEvidence: [],
          selectedEvidence: ['e1'],
        },
        display: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
        safeDisplay: { title: '', description: '', reasons: [], cta: { label: '', href: '' } },
        internal: {
          auditId: 'audit-1',
          baselineVersionHash: 'hash-1',
          complianceFlags: [],
        },
      }),
    } as unknown as CoverLettersService;

    const controller = new CoverLettersController(service);
    const result = await controller.generate(
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
    );

    expect(result.traceMap).toEqual({ opening: ['e1'] });
    expect(result.debugTrace.selectedEvidence).toEqual(['e1']);
  });
});
