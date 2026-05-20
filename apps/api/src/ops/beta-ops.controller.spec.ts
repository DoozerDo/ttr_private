import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaOpsController } from './beta-ops.controller';

describe('BetaOpsController status contract', () => {
  function config(founders: string) {
    return {
      get: (key: string) => {
        if (key === 'FOUNDER_EMAILS') return founders;
        return undefined;
      },
    } as unknown as ConfigService;
  }

  it('rejects non-founder callers', async () => {
    const controller = new BetaOpsController(
      config('founder@ttr.test'),
      {} as any,
      {} as any,
    );

    await expect(
      controller.status('tester@ttr.test', { user: { email: 'user@ttr.test' } } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns assigned/redeemable fields without exposing raw codes', async () => {
    const usersService = {
      findByEmail: async (email: string) => ({ id: 'u1', email }),
    };
    const accessCodesService = {
      userHasActiveAccess: async () => false,
      userHasAssignedUnredeemedAccessCode: async () => true,
      countAssignedUnredeemedAccessCodes: async () => 1,
      listCodesForUser: async () => [{ id: 'c1' }],
      toAdminListRow: () => ({ id: 'c1', codeMasked: 'TTR-XXXX-****-****' }),
    };

    const controller = new BetaOpsController(
      config('founder@ttr.test'),
      usersService as any,
      accessCodesService as any,
    );

    const result = await controller.status('tester@ttr.test', {
      user: { email: 'founder@ttr.test' },
    } as any);

    expect(result).toMatchObject({
      ok: true,
      email: 'tester@ttr.test',
      user: { id: 'u1', email: 'tester@ttr.test' },
      hasActiveAccess: false,
      hasAssignedAccessCode: true,
      canRedeemAccess: true,
      assignedUnredeemedCount: 1,
    });

    // Ensure status does not leak raw access code values (full redeemable code format).
    expect(JSON.stringify(result)).not.toMatch(/TTR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  });

  it('throws for missing email query', async () => {
    const controller = new BetaOpsController(config('founder@ttr.test'), {} as any, {} as any);
    await expect(
      controller.status('', { user: { email: 'founder@ttr.test' } } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
