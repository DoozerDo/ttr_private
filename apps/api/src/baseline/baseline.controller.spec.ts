import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BaselineController } from './baseline.controller';

describe('BaselineController - strengthening additions', () => {
  const baselineVersionService = {
    promoteBaselineVersion: jest.fn(),
  } as any;

  it('returns validation error when detail is missing', async () => {
    const baselineService = {
      appendStrengtheningAddition: jest.fn(),
    } as any;
    const controller = new BaselineController(
      baselineService,
      baselineVersionService,
    );

    await expect(
      controller.appendStrengtheningAddition(
        'baseline-1',
        { detail: '   ' },
        { user: { id: 'user-1' } } as any,
      ),
    ).rejects.toMatchObject({
      response: {
        error: 'INVALID_BASELINE_UPDATE',
        reason: 'Missing required field: rawText',
      },
    });
  });

  it('accepts structured organizational_scale payload and forwards normalized detail', async () => {
    const baselineService = {
      appendStrengtheningAddition: jest.fn().mockResolvedValue({
        baseline: { id: 'baseline-1' },
        impactType: 'new_match',
        scoreDelta: 3,
        explanation: 'This addition matched a previously unmet requirement.',
        matchedRequirement: 'reduce incident resolution time',
      }),
    } as any;
    const controller = new BaselineController(
      baselineService,
      baselineVersionService,
    );

    await controller.appendStrengtheningAddition(
      'baseline-1',
      {
        signalType: 'organizational_scale',
        rawText: 'Led support ops at enterprise scale',
        value: { teamSize: '50+', customerCount: '10,000+', isEstimate: true },
      },
      { user: { id: 'user-1' } } as any,
    );

    expect(baselineService.appendStrengtheningAddition).toHaveBeenCalledWith(
      'user-1',
      'baseline-1',
      expect.stringContaining(
        'organizational_scale: Led support ops at enterprise scale (teamSize=50+, customerCount=10000+, isEstimate=true)',
      ),
    );
  });

  it('accepts organizational_scale payload without parsed numeric fields when rawText is provided', async () => {
    const baselineService = {
      appendStrengtheningAddition: jest.fn().mockResolvedValue({
        baseline: { id: 'baseline-1' },
        impactType: 'no_match',
        scoreDelta: 0,
        explanation: 'This addition was saved, but it did not map to an unmet job requirement yet.',
        matchedRequirement: null,
      }),
    } as any;
    const controller = new BaselineController(
      baselineService,
      baselineVersionService,
    );

    await controller.appendStrengtheningAddition(
      'baseline-1',
      {
        signalType: 'organizational_scale',
        rawText: 'Owned operational scale improvements across support teams.',
        value: { isEstimate: true },
      },
      { user: { id: 'user-1' } } as any,
    );

    expect(baselineService.appendStrengtheningAddition).toHaveBeenCalledWith(
      'user-1',
      'baseline-1',
      expect.stringContaining('organizational_scale: Owned operational scale improvements across support teams.'),
    );
  });

  it('returns structured rejection payload for non-http errors', async () => {
    const baselineService = {
      appendStrengtheningAddition: jest
        .fn()
        .mockRejectedValue(new Error('Section payload violates schema')),
    } as any;
    const controller = new BaselineController(
      baselineService,
      baselineVersionService,
    );

    await expect(
      controller.appendStrengtheningAddition(
        'baseline-1',
        { detail: 'Added quantified ownership evidence' },
        { user: { id: 'user-1' } } as any,
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'BASELINE_UPDATE_REJECTED',
          message:
            "This update couldn't be applied because: Section payload violates schema",
          details: {
            baselineId: 'baseline-1',
            reason: 'Section payload violates schema',
          },
        },
      },
    });
  });

  it('passes through known http exceptions from the service', async () => {
    const baselineService = {
      appendStrengtheningAddition: jest
        .fn()
        .mockRejectedValue(new NotFoundException('Baseline not found')),
    } as any;
    const controller = new BaselineController(
      baselineService,
      baselineVersionService,
    );

    await expect(
      controller.appendStrengtheningAddition(
        'baseline-1',
        { detail: 'Added quantified ownership evidence' },
        { user: { id: 'user-1' } } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
