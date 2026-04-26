import { BadRequestException } from '@nestjs/common';
import { validateAnalysisContext } from './analysis-context-binding';

describe('validateAnalysisContext', () => {
  it('passes when expected and received baselineVersionId are both null', async () => {
    const assessment = {
      id: 'a1',
      userId: 'u1',
      jobId: 'j1',
      baselineId: 'b1',
      baselineVersion: null,
    } as any;

    const analysisRepository = {
      findOne: jest.fn().mockResolvedValue(assessment),
    } as any;
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    } as any;

    await expect(
      validateAnalysisContext({
        analysisRepository,
        baselineVersionRepository,
        analysisId: 'a1',
        userId: 'u1',
        jobId: 'j1',
        baselineId: 'b1',
        baselineVersionId: null,
      }),
    ).resolves.toBe(assessment);
  });

  it('still throws analysis_context_mismatch when jobId truly differs', async () => {
    const assessment = {
      id: 'a1',
      userId: 'u1',
      jobId: 'j-expected',
      baselineId: 'b1',
      baselineVersion: null,
    } as any;

    const analysisRepository = {
      findOne: jest.fn().mockResolvedValue(assessment),
    } as any;
    const baselineVersionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    } as any;

    await expect(
      validateAnalysisContext({
        analysisRepository,
        baselineVersionRepository,
        analysisId: 'a1',
        userId: 'u1',
        jobId: 'j-received',
        baselineId: 'b1',
        baselineVersionId: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    try {
      await validateAnalysisContext({
        analysisRepository,
        baselineVersionRepository,
        analysisId: 'a1',
        userId: 'u1',
        jobId: 'j-received',
        baselineId: 'b1',
        baselineVersionId: null,
      });
    } catch (error) {
      const response = (error as any)?.getResponse?.() ?? null;
      expect(response?.error?.code).toBe('analysis_context_mismatch');
    }
  });
});

