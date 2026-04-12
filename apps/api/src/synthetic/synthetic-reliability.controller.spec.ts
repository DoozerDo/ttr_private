import { BadRequestException } from '@nestjs/common';
import { SyntheticReliabilityController } from './synthetic-reliability.controller';

describe('SyntheticReliabilityController', () => {
  const service = {
    getReliabilityReport: jest.fn(),
    recordRun: jest.fn(),
  } as any;
  const tokenLinkService = {
    getUserTokenLink: jest.fn(),
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
    const controller = new SyntheticReliabilityController(service, tokenLinkService);

    const result = await controller.getReliability('3');

    expect(service.getReliabilityReport).toHaveBeenCalledWith(3);
    expect(result).toEqual({ suites: [] });
  });

  it('records an ingested synthetic run', async () => {
    service.recordRun.mockResolvedValue({ id: 'run-1' });
    const controller = new SyntheticReliabilityController(service, tokenLinkService);

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

  it('returns a synthetic token link for recovery flows', async () => {
    tokenLinkService.getUserTokenLink.mockResolvedValue({
      email: 'synthetic@example.com',
      tokenType: 'reset-password',
      url: 'http://localhost:3100/auth/reset-password?token=abc',
      expiresAt: '2026-04-12T11:00:00.000Z',
    });
    const controller = new SyntheticReliabilityController(service, tokenLinkService);

    const result = await controller.getUserTokenLink('synthetic@example.com', 'reset-password');

    expect(tokenLinkService.getUserTokenLink).toHaveBeenCalledWith('synthetic@example.com', 'reset-password');
    expect(result).toEqual({
      email: 'synthetic@example.com',
      tokenType: 'reset-password',
      url: 'http://localhost:3100/auth/reset-password?token=abc',
      expiresAt: '2026-04-12T11:00:00.000Z',
    });
  });
});
