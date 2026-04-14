import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SyntheticUserTokenLinkService } from './synthetic-user-token-link.service';

describe('SyntheticUserTokenLinkService', () => {
  const repo = {
    findOne: jest.fn(),
  } as any;
  const usersService = {
    findByEmail: jest.fn(),
  } as any;
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3100';
      return undefined;
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-13T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds a reset-password link for the latest token', async () => {
    usersService.findByEmail.mockResolvedValue({ id: 'user-1', email: 'synthetic@example.com' });
    repo.findOne.mockResolvedValue({
      token: 'reset-token',
      expiresAt: new Date('2026-04-13T11:00:00.000Z'),
    });

    const service = new SyntheticUserTokenLinkService(repo, usersService, configService);
    const result = await service.getUserTokenLink('synthetic@example.com', 'reset-password');

    expect(result.tokenType).toBe('reset-password');
    expect(result.url).toBe('http://localhost:3100/auth/reset-password?token=reset-token');
  });

  it('builds a confirmation link when requested', async () => {
    usersService.findByEmail.mockResolvedValue({ id: 'user-1', email: 'synthetic@example.com' });
    repo.findOne.mockResolvedValue({
      token: 'confirm-token',
      expiresAt: new Date('2026-04-13T11:00:00.000Z'),
    });

    const service = new SyntheticUserTokenLinkService(repo, usersService, configService);
    const result = await service.getUserTokenLink('synthetic@example.com', 'confirm');

    expect(result.tokenType).toBe('confirm');
    expect(result.url).toBe('http://localhost:3100/auth/confirm?token=confirm-token');
  });

  it('rejects missing tokens and unknown users', async () => {
    const service = new SyntheticUserTokenLinkService(repo, usersService, configService);

    await expect(service.getUserTokenLink('', 'reset-password')).rejects.toBeInstanceOf(BadRequestException);

    usersService.findByEmail.mockResolvedValue(null);
    await expect(service.getUserTokenLink('missing@example.com', 'reset-password')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
