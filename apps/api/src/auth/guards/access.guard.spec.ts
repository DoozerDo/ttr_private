import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AccessGuard } from './access.guard';
import type { AccessCodesService } from '../../access-codes/access-codes.service';
import type { AdminUsersService } from '../../admin-users/admin-users.service';

describe('AccessGuard', () => {
  const makeContext = (user?: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          headers: {},
          url: '/studio/artifacts',
        }),
      }),
    }) as ExecutionContext;

  const makeConfig = (requireAccessCode = 'true', founderEmails?: string): ConfigService =>
    ({
      get: (key: string) => {
        if (key === 'REQUIRE_ACCESS_CODE') return requireAccessCode;
        if (key === 'FOUNDER_EMAILS') return founderEmails;
        return undefined;
      },
    }) as ConfigService;

  const makeAccessCodesService = (): { userHasActiveAccess: jest.Mock } =>
    ({
      userHasActiveAccess: jest.fn().mockResolvedValue(false),
    });

  const makeAdminUsersService = (): { isAdmin: jest.Mock } =>
    ({
      isAdmin: jest.fn().mockResolvedValue(false),
    });

  it('keeps a verified normal user blocked when no access code exists', async () => {
    const accessCodesService = makeAccessCodesService();
    const adminUsersService = makeAdminUsersService();
    const guard = new AccessGuard(
      accessCodesService as unknown as AccessCodesService,
      makeConfig(),
      adminUsersService as unknown as AdminUsersService,
    );

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', email: 'user@example.com' })),
    ).rejects.toThrow('Access code required');

    expect(adminUsersService.isAdmin).toHaveBeenCalledWith('user-1');
    expect(accessCodesService.userHasActiveAccess).toHaveBeenCalledWith('user-1');
  });

  it('allows a persisted admin session without access code', async () => {
    const accessCodesService = makeAccessCodesService();
    const adminUsersService = makeAdminUsersService();
    adminUsersService.isAdmin.mockResolvedValueOnce(true);
    const guard = new AccessGuard(
      accessCodesService as unknown as AccessCodesService,
      makeConfig(),
      adminUsersService as unknown as AdminUsersService,
    );

    await expect(
      guard.canActivate(makeContext({ id: 'admin-user-1', email: 'operator@example.com' })),
    ).resolves.toBe(true);

    expect(adminUsersService.isAdmin).toHaveBeenCalledWith('admin-user-1');
    expect(accessCodesService.userHasActiveAccess).not.toHaveBeenCalled();
  });

  it('continues to honor founder allowlist without consulting admin membership', async () => {
    const accessCodesService = makeAccessCodesService();
    const adminUsersService = makeAdminUsersService();
    const guard = new AccessGuard(
      accessCodesService as unknown as AccessCodesService,
      makeConfig('true', 'founder@targetthisrole.com'),
      adminUsersService as unknown as AdminUsersService,
    );

    await expect(
      guard.canActivate(makeContext({ id: 'founder-user-1', email: 'Founder@TargetThisRole.com' })),
    ).resolves.toBe(true);

    expect(adminUsersService.isAdmin).not.toHaveBeenCalled();
    expect(accessCodesService.userHasActiveAccess).not.toHaveBeenCalled();
  });
});
