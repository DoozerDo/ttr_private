import { BadRequestException } from '@nestjs/common';
import { SyntheticReliabilityController } from './synthetic-reliability.controller';

describe('SyntheticReliabilityController', () => {
  const service = {
    getReliabilityReport: jest.fn(),
    recordRun: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid history limits', async () => {
    const controller = new SyntheticReliabilityController(service);

    await expect(controller.getReliability('0')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getReliability('not-a-number')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the synthetic reliability report', async () => {
    service.getReliabilityReport.mockResolvedValue({ suites: [] });
    const controller = new SyntheticReliabilityController(service);

    const result = await controller.getReliability('3');

    expect(service.getReliabilityReport).toHaveBeenCalledWith(3);
    expect(result).toEqual({ suites: [] });
  });

  it('records an ingested synthetic run', async () => {
    service.recordRun.mockResolvedValue({ id: 'run-1' });
    const controller = new SyntheticReliabilityController(service);

    const result = await controller.recordRun({
      suiteKey: 'landing-public-journeys',
      status: 'running',
      startedAt: '2026-04-12T10:00:00.000Z',
      durationMs: 10,
    } as never);

    expect(service.recordRun).toHaveBeenCalledWith({
      suiteKey: 'landing-public-journeys',
      status: 'running',
      startedAt: '2026-04-12T10:00:00.000Z',
      durationMs: 10,
    });
    expect(result).toEqual({ id: 'run-1' });
  });
});
