import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ResendEmailService } from './resend-email.service';

describe('ResendEmailService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  function buildService(configValues: Record<string, string | undefined>) {
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;

    return new ResendEmailService(configService);
  }

  it('logs and skips delivery when RESEND_API_KEY is missing in dev', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(globalThis as any, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response);
    const service = buildService({
      NODE_ENV: 'development',
      MAIL_FROM: 'test@yourdomain.com',
    });

    await expect(
      service.sendEmail({
        to: 'user@example.com',
        subject: 'Confirm your account',
        html: '<p>Confirm: https://example.com/auth/confirm?token=test-token</p>',
      }),
    ).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('email_delivery_skipped'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/auth/confirm?token=test-token'),
    );
  });

  it('falls back safely when the upstream resend request fails in dev', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(globalThis as any, 'fetch').mockRejectedValue(
      new Error('ECONNRESET'),
    );
    const service = buildService({
      NODE_ENV: 'test',
      RESEND_API_KEY: 'test-resend-key',
      MAIL_FROM: 'test@yourdomain.com',
    });

    await expect(
      service.sendEmail({
        to: 'user@example.com',
        subject: 'Reset your password',
        html: '<p>Reset: https://example.com/auth/reset-password?token=test-token</p>',
      }),
    ).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('email_delivery_fallback'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/auth/reset-password?token=test-token'),
    );
  });
});
