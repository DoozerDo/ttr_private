import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AdminBypassGuard } from './admin-bypass.guard';
import type { AdminUsersService } from './admin-users.service';

describe('AdminBypassGuard', () => {
  const makeContext = (user?: Record<string, unknown>, headers?: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          headers: headers ?? {},
          url: '/admin/users',
        }),
      }),
    }) as ExecutionContext;

  const makeConfig = (
    nodeEnv: string,
    founderEmails?: string,
  ): ConfigService =>
    ({
      get: (key: string) => {
        if (key === 'NODE_ENV') return nodeEnv;
        if (key === 'FOUNDER_EMAILS') return founderEmails;
        return undefined;
      },
    }) as ConfigService;

  const makeAdminService = (): AdminUsersService =>
    ({
      isAdmin: jest.fn().mockResolvedValue(true),
    }) as unknown as AdminUsersService;

  it('uses req.user.id when available', async () => {
    const config = makeConfig('production');
    const adminService = makeAdminService();
    const guard = new AdminBypassGuard(config, adminService);

    const context = makeContext({ id: 'primary-id' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminService.isAdmin).toHaveBeenCalledWith('primary-id');
  });

  it('falls back to req.user.userId when id missing', async () => {
    const config = makeConfig('production');
    const adminService = makeAdminService();
    const guard = new AdminBypassGuard(config, adminService);

    const context = makeContext({ userId: 'alias-id' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminService.isAdmin).toHaveBeenCalledWith('alias-id');
  });

  it('uses x-dev-user-id in non-prod when req.user empty', async () => {
    const config = makeConfig('development');
    const adminService = makeAdminService();
    const guard = new AdminBypassGuard(config, adminService);

    const context = makeContext(undefined, { 'x-dev-user-id': 'dev-id' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminService.isAdmin).toHaveBeenCalledWith('dev-id');
  });

  it('allows founder email without admin_users lookup', async () => {
    const config = makeConfig('production', 'founder@targetthisrole.com');
    const adminService = makeAdminService();
    const guard = new AdminBypassGuard(config, adminService);

    const context = makeContext({ id: 'founder-id', email: 'Founder@TargetThisRole.com' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminService.isAdmin).not.toHaveBeenCalled();
  });
});
