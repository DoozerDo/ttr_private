import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AccountType } from '../users/account-type.enum';
import { UserToken } from './user-token.entity';
import { ResendEmailService } from '../email/resend-email.service';
import { AccessCodesService } from '../access-codes/access-codes.service';
import { AdminUsersService } from '../admin-users/admin-users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let resendEmailService: jest.Mocked<ResendEmailService>;
  let jwtService: JwtService;
  let configService: { get: jest.Mock };
  let adminUsersService: { isAdmin: jest.Mock };
  let userTokensRepository: {
    save: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
  };
  let accessCodesService: {
    redeemCodeForUser: jest.Mock;
    redeemAssignedCodeForUser: jest.Mock;
    userHasActiveAccess: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            setEmailConfirmed: jest.fn(),
          },
        },
        {
          provide: ResendEmailService,
          useValue: {
            sendEmail: jest.fn(),
          },
        },
        {
          provide: AccessCodesService,
          useValue: {
            redeemCodeForUser: jest.fn(),
            redeemAssignedCodeForUser: jest.fn().mockResolvedValue(false),
            userHasActiveAccess: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: AdminUsersService,
          useValue: {
            isAdmin: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'REQUIRE_EMAIL_CONFIRMATION') {
                return 'false';
              }
              if (key === 'NODE_ENV') {
                return 'test';
              }
              if (key === 'APP_PUBLIC_WEB_URL') {
                return 'http://localhost:3000';
              }
              return undefined;
            }),
          },
        },
        {
          provide: getRepositoryToken(UserToken),
          useValue: {
            save: jest.fn(),
            create: jest.fn((value) => value),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    resendEmailService = module.get(ResendEmailService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    adminUsersService = module.get(AdminUsersService);
    accessCodesService = module.get(AccessCodesService);
    userTokensRepository = module.get(getRepositoryToken(UserToken));
    jest.spyOn(jwtService, 'sign').mockReturnValue('signed-token');
  });

  it('registers a user', async () => {
    const payload: RegisterDto = {
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    };
    const savedUser: User = {
      id: 'user-id',
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      emailConfirmed: true,
      passwordHash: '',
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockImplementation(async ({ email, passwordHash }) => ({
      ...savedUser,
      email,
      passwordHash,
    }));

    const result = await service.register(payload);
    const hashedPasswordArg = usersService.create.mock.calls[0][0].passwordHash;

    expect(hashedPasswordArg).not.toEqual(payload.password);
    expect(result.success).toEqual(true);
  });

  it('logs in a user with valid credentials', async () => {
    const payload: LoginDto = {
      email: 'user@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'user-id',
      email: payload.email,
      firstName: 'Test',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash,
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);

    const result = await service.login(payload);

    expect(result.accessToken).toEqual('signed-token');
    expect(result.user).toMatchObject({
      id: savedUser.id,
      email: savedUser.email,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
    });
  });

  it('enforces access code for admin users when access code is required', async () => {
    const payload: LoginDto = {
      email: 'admin@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'admin-user-id',
      email: payload.email,
      firstName: 'Admin',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash,
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);

    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_ACCESS_CODE') {
        return 'true';
      }
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') {
        return 'false';
      }
      if (key === 'NODE_ENV') {
        return 'test';
      }
      return undefined;
    });

    accessCodesService.userHasActiveAccess.mockResolvedValue(false);
    accessCodesService.redeemAssignedCodeForUser.mockResolvedValue(false);

    await expect(service.login(payload)).rejects.toThrow('Access code required');
  });

  it('auto-redeems an assigned access code during login when no active access code exists', async () => {
    const payload: LoginDto = {
      email: 'member@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'member-user-id',
      email: payload.email,
      firstName: 'Member',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash,
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);

    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_ACCESS_CODE') {
        return 'true';
      }
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') {
        return 'false';
      }
      if (key === 'NODE_ENV') {
        return 'test';
      }
      return undefined;
    });

    accessCodesService.userHasActiveAccess.mockResolvedValue(false);
    accessCodesService.redeemAssignedCodeForUser.mockResolvedValue(true);

    const result = await service.login(payload);

    expect(accessCodesService.userHasActiveAccess).toHaveBeenCalledWith(savedUser.id);
    expect(accessCodesService.redeemAssignedCodeForUser).toHaveBeenCalledWith(savedUser);
    expect(result.accessToken).toEqual('signed-token');
    expect(result.user).toMatchObject({
      id: savedUser.id,
      email: savedUser.email,
    });
  });

  it('returns access code required when no assigned code can be auto-redeemed', async () => {
    const payload: LoginDto = {
      email: 'member2@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'member2-user-id',
      email: payload.email,
      firstName: 'Member',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash,
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);

    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_ACCESS_CODE') {
        return 'true';
      }
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') {
        return 'false';
      }
      if (key === 'NODE_ENV') {
        return 'test';
      }
      return undefined;
    });

    accessCodesService.userHasActiveAccess.mockResolvedValue(false);
    accessCodesService.redeemAssignedCodeForUser.mockResolvedValue(false);

    await expect(service.login(payload)).rejects.toThrow('Access code required');

    expect(accessCodesService.userHasActiveAccess).toHaveBeenCalledWith(savedUser.id);
    expect(accessCodesService.redeemAssignedCodeForUser).toHaveBeenCalledWith(savedUser);
  });

  it('allows login with an existing active access code when required', async () => {
    const payload: LoginDto = {
      email: 'active@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'active-user-id',
      email: payload.email,
      firstName: 'Active',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash,
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);

    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_ACCESS_CODE') return 'true';
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') return 'false';
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    });

    accessCodesService.userHasActiveAccess.mockResolvedValue(true);

    const result = await service.login(payload);

    expect(accessCodesService.userHasActiveAccess).toHaveBeenCalledWith(savedUser.id);
    expect(accessCodesService.redeemAssignedCodeForUser).not.toHaveBeenCalled();
    expect(result.accessToken).toEqual('signed-token');
  });

  it('uses configured public web URL and support email in confirmation email content', async () => {
    const payload: RegisterDto = {
      firstName: 'Beta',
      lastName: 'User',
      email: 'beta@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    };
    const savedUser: User = {
      id: 'beta-user-id',
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      emailConfirmed: false,
      passwordHash: '',
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') return 'true';
      if (key === 'NODE_ENV') return 'production';
      if (key === 'APP_PUBLIC_WEB_URL') return 'https://targetthisrole.com/';
      if (key === 'SUPPORT_EMAIL') return 'support-beta@targetthisrole.com';
      return undefined;
    });

    service = new AuthService(
      usersService,
      jwtService,
      resendEmailService,
      configService as unknown as ConfigService,
      userTokensRepository as any,
      accessCodesService as unknown as AccessCodesService,
      adminUsersService as unknown as AdminUsersService,
    );

    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockImplementation(async ({ email, passwordHash }) => ({
      ...savedUser,
      email,
      passwordHash,
    }));

    await service.register(payload);

    expect(resendEmailService.sendEmail).toHaveBeenCalledTimes(1);
    const emailPayload = resendEmailService.sendEmail.mock.calls[0][0];

    expect(emailPayload.replyTo).toEqual('support-beta@targetthisrole.com');
    expect(emailPayload.html).toContain('https://targetthisrole.com/auth/confirm?token=');
    expect(emailPayload.html).toContain('support-beta@targetthisrole.com');
    expect(emailPayload.html).not.toContain('targetthisrole.ai');
  });

  it('sends internal registration notification when REGISTRATION_NOTIFY_EMAIL is configured', async () => {
    const payload: RegisterDto = {
      firstName: 'Notify',
      lastName: 'User',
      email: 'notify@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    };
    const createdAt = new Date('2026-03-05T12:00:00.000Z');
    const savedUser: User = {
      id: 'notify-user-id',
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      emailConfirmed: true,
      passwordHash: '',
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt,
      updatedAt: createdAt,
    };

    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') return 'false';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3000';
      if (key === 'REGISTRATION_NOTIFY_EMAIL') return 'ops@example.com';
      return undefined;
    });

    service = new AuthService(
      usersService,
      jwtService,
      resendEmailService,
      configService as unknown as ConfigService,
      userTokensRepository as any,
      accessCodesService as unknown as AccessCodesService,
      adminUsersService as unknown as AdminUsersService,
    );

    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue(savedUser);

    await service.register(payload);

    expect(resendEmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@example.com',
        subject: 'New TTR registration',
      }),
    );
  });

});
