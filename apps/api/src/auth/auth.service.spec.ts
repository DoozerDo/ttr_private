import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
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
    resolveBetaAccessApproved: jest.Mock;
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
            updatePasswordHash: jest.fn(),
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
            resolveBetaAccessApproved: jest.fn(),
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
              if (key === 'JWT_SECRET') {
                return 'test-jwt-secret';
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
    accessCodesService.resolveBetaAccessApproved.mockImplementation(
      async (input: { userId: string; betaAccessApproved?: boolean | null }) => {
        if (input.betaAccessApproved === true) return true;
        return Boolean(await accessCodesService.userHasActiveAccess(input.userId));
      },
    );
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

  it('returns a safe error when user creation fails unexpectedly', async () => {
    const payload: RegisterDto = {
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    };

    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockRejectedValue(new Error('db unavailable'));

    await expect(service.register(payload)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(service.register(payload)).rejects.toThrow(
      /Signup failed due to an unexpected server error/i,
    );
  });

  it('returns a success response when registering a duplicate email', async () => {
    const payload: RegisterDto = {
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    };

    usersService.findByEmail.mockResolvedValue({
      id: 'existing-user',
      email: payload.email,
    } as unknown as User);

    const result = await service.register(payload);
    expect(result.success).toBe(true);
  });

  it('rejects invalid signup input when passwords do not match', async () => {
    const payload: RegisterDto = {
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      password: 'Password123',
      confirmPassword: 'Different123',
    };

    await expect(service.register(payload)).rejects.toThrow(/Passwords do not match/i);
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

  it('treats betaAccessApproved users as PRO on login', async () => {
    const payload: LoginDto = {
      email: 'beta-user@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'beta-user-id',
      email: payload.email,
      firstName: 'Beta',
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
      betaAccessApproved: true,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);

    const result = await service.login(payload);

    expect(result.user).toMatchObject({
      id: savedUser.id,
      subscriptionTier: SubscriptionTier.PRO,
    });
    expect(result.user.entitlements.effectiveTier).toEqual(SubscriptionTier.PRO);
  });

  it('treats redeemed access code users as PRO on login even when betaAccessApproved is false', async () => {
    const payload: LoginDto = {
      email: 'beta-code-user@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'beta-code-user-id',
      email: payload.email,
      firstName: 'Beta',
      lastName: 'CodeUser',
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
      betaAccessApproved: false,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);
    accessCodesService.userHasActiveAccess.mockResolvedValueOnce(true);

    const result = await service.login(payload);

    expect(result.user).toMatchObject({
      id: savedUser.id,
      subscriptionTier: SubscriptionTier.PRO,
    });
    expect(result.user.entitlements.tier).toEqual(SubscriptionTier.PRO);
    expect(result.user.entitlements.effectiveTier).toEqual(SubscriptionTier.PRO);
  });

  it('returns UnauthorizedException when user is not found', async () => {
    const payload: LoginDto = {
      email: 'missing@example.com',
      password: 'Password123',
    };
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.login(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns UnauthorizedException when password is invalid', async () => {
    const payload: LoginDto = {
      email: 'user@example.com',
      password: 'WrongPassword',
    };
    const passwordHash = await bcrypt.hash('Password123', 10);
    usersService.findByEmail.mockResolvedValue({
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
    } as User);

    await expect(service.login(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
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
      if (key === 'APP_PUBLIC_WEB_URL') {
        return 'http://localhost:3000';
      }
      if (key === 'JWT_SECRET') {
        return 'test-jwt-secret';
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
      if (key === 'APP_PUBLIC_WEB_URL') {
        return 'http://localhost:3000';
      }
      if (key === 'JWT_SECRET') {
        return 'test-jwt-secret';
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
      if (key === 'APP_PUBLIC_WEB_URL') {
        return 'http://localhost:3000';
      }
      if (key === 'JWT_SECRET') {
        return 'test-jwt-secret';
      }
      return undefined;
    });

    accessCodesService.userHasActiveAccess.mockResolvedValue(false);
    accessCodesService.redeemAssignedCodeForUser.mockResolvedValue(false);

    await expect(service.login(payload)).rejects.toThrow('Access code required');

    expect(accessCodesService.userHasActiveAccess).toHaveBeenCalledWith(savedUser.id);
    expect(accessCodesService.redeemAssignedCodeForUser).toHaveBeenCalledWith(savedUser);
  });

  it('returns ForbiddenException when access code is required and user id is missing', async () => {
    const payload: LoginDto = {
      email: 'broken@example.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser = {
      id: '' as unknown as string,
      email: payload.email,
      firstName: 'Broken',
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
    } as User;
    usersService.findByEmail.mockResolvedValue(savedUser);
    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_ACCESS_CODE') return 'true';
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') return 'false';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3000';
      if (key === 'JWT_SECRET') return 'test-jwt-secret';
      return undefined;
    });

    await expect(service.login(payload)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns InternalServerErrorException when JWT_SECRET is missing', async () => {
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
    configService.get.mockImplementation((key: string) => {
      if (key === 'REQUIRE_EMAIL_CONFIRMATION') return 'false';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3000';
      if (key === 'JWT_SECRET') return '';
      return undefined;
    });

    await expect(service.login(payload)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(service.login(payload)).rejects.toThrow(
      'Missing JWT_SECRET environment variable for login.',
    );
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
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3000';
      if (key === 'JWT_SECRET') return 'test-jwt-secret';
      return undefined;
    });

    accessCodesService.userHasActiveAccess.mockResolvedValue(true);

    const result = await service.login(payload);

    expect(accessCodesService.userHasActiveAccess).toHaveBeenCalledWith(savedUser.id);
    expect(accessCodesService.redeemAssignedCodeForUser).not.toHaveBeenCalled();
    expect(result.accessToken).toEqual('signed-token');
  });

  it('allows founder login without access code and applies admin/pro overrides', async () => {
    const payload: LoginDto = {
      email: 'Founder@TargetThisRole.com',
      password: 'Password123',
    };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'founder-user-id',
      email: payload.email,
      firstName: 'Founder',
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
      if (key === 'FOUNDER_EMAILS') return 'founder@targetthisrole.com';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3000';
      if (key === 'JWT_SECRET') return 'test-jwt-secret';
      return undefined;
    });

    accessCodesService.userHasActiveAccess.mockResolvedValue(false);
    accessCodesService.redeemAssignedCodeForUser.mockResolvedValue(false);

    const result = await service.login(payload);

    expect(accessCodesService.userHasActiveAccess).not.toHaveBeenCalled();
    expect(accessCodesService.redeemAssignedCodeForUser).not.toHaveBeenCalled();
    expect(result.user).toMatchObject({
      id: savedUser.id,
      role: 'admin',
      subscriptionTier: SubscriptionTier.PRO,
    });
    expect(result.user.entitlements.effectiveTier).toEqual(SubscriptionTier.PRO);
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

  it('registers a user and falls back to logging when confirmation email send fails in development', async () => {
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
      if (key === 'NODE_ENV') return 'development';
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3000';
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
    resendEmailService.sendEmail.mockRejectedValue(new Error('upstream unavailable'));

    const result = await service.register(payload);

    expect(result.success).toBe(true);
    expect(result.emailConfirmationRequired).toBe(true);
    expect(resendEmailService.sendEmail).toHaveBeenCalledTimes(1);
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

  it('requests password reset with a generic response', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'reset-user',
      email: 'reset@example.com',
      firstName: 'Reset',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash: 'hash',
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      studioResumeFocusDefault: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User);
    configService.get.mockImplementation((key: string) => {
      if (key === 'RESEND_API_KEY') return 'test-resend-key';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'APP_PUBLIC_WEB_URL') return 'http://localhost:3000';
      return undefined;
    });

    const result = await service.requestPasswordReset('reset@example.com');

    expect(result.success).toBe(true);
    expect(resendEmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'reset@example.com',
        subject: 'Reset your password',
      }),
    );
  });

  it('rejects invalid reset tokens and updates password on valid reset', async () => {
    userTokensRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.resetPassword('bad-token', 'Password123')).rejects.toThrow(
      'Invalid or expired reset token',
    );

    userTokensRepository.findOne.mockResolvedValueOnce({
      id: 'token-id',
      userId: 'user-id',
      token: 'good-token',
      type: 'reset-password',
      expiresAt: new Date(Date.now() + 1000),
    });
    usersService.findById.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash: 'old-hash',
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      studioResumeFocusDefault: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User);

    const result = await service.resetPassword('good-token', 'Password123');
    expect(result.success).toBe(true);
    expect(usersService.updatePasswordHash).toHaveBeenCalledWith(
      'user-id',
      expect.any(String),
    );
  });

  it('changes password after validating the current password', async () => {
    const hash = await bcrypt.hash('OldPassword123', 10);
    usersService.findById.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      emailConfirmed: true,
      passwordHash: hash,
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      studioResumeFocusDefault: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User);

    await expect(
      service.changePassword('user-id', 'WrongPassword', 'NewPassword123'),
    ).rejects.toThrow('Current password is incorrect');

    const result = await service.changePassword(
      'user-id',
      'OldPassword123',
      'NewPassword123',
    );
    expect(result.success).toBe(true);
  });

});
