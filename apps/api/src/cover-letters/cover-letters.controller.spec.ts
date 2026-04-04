import { ForbiddenException, HttpStatus, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';
import { Entitlements, getEntitlementsForTier } from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';

type TestTieredRequest = Request & {
  user: {
    id: string;
    subscriptionTier: SubscriptionTier;
    entitlements: Entitlements;
  };
};

type TestCoverLetterService = {
  exportCoverLetter: jest.Mock;
};

const coverLettersService: TestCoverLetterService = {
  exportCoverLetter: jest.fn(),
};

const buildRequest = (tier: SubscriptionTier): TestTieredRequest => {
  return {
    user: {
      id: 'user-1',
      subscriptionTier: tier,
      entitlements: getEntitlementsForTier(tier),
    },
  } as TestTieredRequest;
};

const buildResponse = (): Response => {
  const response: Partial<Response> = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  return response as Response;
};

const baseDto: GenerateCoverLetterDto = {
  baselineId: 'baseline-1',
  baselineVersionId: 'baseline-version-1',
  jobId: 'job-1',
};

describe('CoverLettersController export gating', () => {
  let controller: CoverLettersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CoverLettersController(
      coverLettersService as unknown as CoverLettersService,
    );
  });

  it('blocks FREE tier cover-letter export with TIER_REQUIRED', async () => {
    const request = buildRequest(SubscriptionTier.FREE);
    const response = buildResponse();
    let caughtError: unknown;

    try {
      await controller.exportCoverLetter(baseDto, request, response);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ForbiddenException);
    const forbiddenError = caughtError as ForbiddenException;
    expect(forbiddenError.getResponse()).toMatchObject({
      code: 'TIER_REQUIRED',
      message: 'Upgrade to Pro to download documents.',
      details: {
        requiredTier: SubscriptionTier.PRO,
        currentTier: SubscriptionTier.FREE,
        feature: 'EXPORT_COVER',
      },
    });
    expect(coverLettersService.exportCoverLetter).not.toHaveBeenCalled();
  });

  it('allows PRO tier cover-letter export and forwards the file', async () => {
    const request = buildRequest(SubscriptionTier.PRO);
    const response = buildResponse();
    const file = {
      buffer: Buffer.from('data'),
      contentType: 'application/pdf',
      filename: 'cover-letter.docx',
      auditId: 'audit-1',
      baselineVersionHash: 'hash-1',
    };
    coverLettersService.exportCoverLetter.mockResolvedValueOnce(file);

    const result = await controller.exportCoverLetter(baseDto, request, response);

    expect(coverLettersService.exportCoverLetter).toHaveBeenCalledWith(
      'user-1',
      baseDto,
      'docx',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      file.contentType,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="cover-letter.docx"',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Length',
      String(file.buffer.byteLength),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Compliance-Audit-Id',
      file.auditId,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Baseline-Version-Hash',
      file.baselineVersionHash,
    );
    expect(response.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(response.send).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
