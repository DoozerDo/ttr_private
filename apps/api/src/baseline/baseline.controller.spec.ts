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
    ).rejects.toThrow('detail is required');
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
