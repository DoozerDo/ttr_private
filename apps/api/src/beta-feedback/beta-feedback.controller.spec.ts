import { ForbiddenException } from '@nestjs/common';
import { BetaFeedbackController } from './beta-feedback.controller';
import { BetaFeedbackSeverity } from './beta-feedback.entity';

describe('BetaFeedbackController', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    getSummary: jest.fn(),
  } as any;

  const controller = new BetaFeedbackController(service);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('blocks create for non-admin users', async () => {
    await expect(
      controller.create(
        {
          title: 'x',
          where: 'y',
          actual: 'a',
          expected: 'b',
          severity: BetaFeedbackSeverity.MINOR,
        },
        { user: { role: 'member' } } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates and fetches for admin users', async () => {
    service.create.mockResolvedValue({ id: 'bf-1' });
    service.findAll.mockResolvedValue([{ id: 'bf-1' }]);

    await controller.create(
      {
        title: 'Score issue',
        where: 'Results',
        actual: 'Score too high',
        expected: 'Score lower',
        severity: BetaFeedbackSeverity.MAJOR,
      },
      { user: { id: 'admin-1', role: 'admin' } } as any,
    );
    const list = await controller.findAll(
      { severity: BetaFeedbackSeverity.MAJOR } as any,
      { user: { role: 'admin' } } as any,
    );

    expect(service.create).toHaveBeenCalled();
    expect(service.findAll).toHaveBeenCalledWith({
      severity: BetaFeedbackSeverity.MAJOR,
    });
    expect(list).toEqual([{ id: 'bf-1' }]);
  });

  it('returns summary for admin users', async () => {
    service.getSummary.mockResolvedValue({ totalCount: 3 });
    const result = await controller.getSummary({ user: { role: 'admin' } } as any);
    expect(result).toEqual({ totalCount: 3 });
  });
});

