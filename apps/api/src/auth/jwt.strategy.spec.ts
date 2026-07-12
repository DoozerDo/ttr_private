import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { UsersService } from '../users/users.service';
import { AccessCodesService } from '../access-codes/access-codes.service';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { User } from '../users/user.entity';

describe('JwtStrategy', () => {
  function makeConfig(): ConfigService {
    return {
      get: (key: string) => {
        if (key === 'JWT_SECRET') return 'test-jwt-secret';
        if (key === 'FOUNDER_EMAILS') return 'founder@targetthisrole.com';
        return undefined;
      },
    } as ConfigService;
  }

  function makeUsersService(): { findById: jest.Mock } {
    return {
      findById: jest.fn(),
    };
  }

  function makeAccessCodesService(): {
    resolveBetaAccessApproved: jest.Mock;
  } {
    return {
      resolveBetaAccessApproved: jest.fn().mockResolvedValue(false),
    };
  }

  function makeAdminUsersService(): { isAdmin: jest.Mock } {
    return {
      isAdmin: jest.fn().mockResolvedValue(false),
    };
  }

  it('resolves persisted admin users as admin PRO sessions', async () => {
    const configService = makeConfig();
    const usersService = makeUsersService();
    const accessCodesService = makeAccessCodesService();
    const adminUsersService = makeAdminUsersService();
    adminUsersService.isAdmin.mockResolvedValueOnce(true);

    const strategy = new JwtStrategy(
      configService,
      usersService as unknown as UsersService,
      accessCodesService as unknown as AccessCodesService,
      adminUsersService as unknown as AdminUsersService,
    );

    const user: User = {
      id: 'admin-user-id',
      email: 'operator@example.com',
      firstName: 'Admin',
      lastName: 'Operator',
      emailConfirmed: true,
      passwordHash: 'hash',
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: null as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    usersService.findById.mockResolvedValue(user);

    const result = await strategy.validate({
      sub: user.id,
      email: user.email,
      subscriptionTier: SubscriptionTier.FREE,
    });

    expect(adminUsersService.isAdmin).toHaveBeenCalledWith(user.id);
    expect(accessCodesService.resolveBetaAccessApproved).not.toHaveBeenCalled();
    expect(result.role).toBe('admin');
    expect(result.subscriptionTier).toBe(SubscriptionTier.PRO);
    expect(result.entitlements.effectiveTier).toBe(SubscriptionTier.PRO);
  });

  it('preserves normal user claims when the account is not privileged', async () => {
    const configService = makeConfig();
    const usersService = makeUsersService();
    const accessCodesService = makeAccessCodesService();
    const adminUsersService = makeAdminUsersService();

    const strategy = new JwtStrategy(
      configService,
      usersService as unknown as UsersService,
      accessCodesService as unknown as AccessCodesService,
      adminUsersService as unknown as AdminUsersService,
    );

    const user: User = {
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Normal',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash: 'hash',
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: null as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    usersService.findById.mockResolvedValue(user);

    const result = await strategy.validate({
      sub: user.id,
      email: user.email,
      subscriptionTier: SubscriptionTier.FREE,
    });

    expect(adminUsersService.isAdmin).toHaveBeenCalledWith(user.id);
    expect(accessCodesService.resolveBetaAccessApproved).toHaveBeenCalledWith({
      userId: user.id,
      betaAccessApproved: user.betaAccessApproved,
    });
    expect(result.role).toBe('user');
    expect(result.subscriptionTier).toBe(SubscriptionTier.FREE);
  });
});
