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
import { RelayEmailService } from '../email/relay-email.service';
import { AccessCodesService } from '../access-codes/access-codes.service';
import { AdminUsersService } from '../admin-users/admin-users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: JwtService;
  let configService: { get: jest.Mock };
  let adminUsersService: { isAdmin: jest.Mock };

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
          provide: RelayEmailService,
          useValue: {
            sendRawRelayEmail: jest.fn(),
          },
        },
        {
          provide: AccessCodesService,
          useValue: {
            redeemCodeForUser: jest.fn(),
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
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    adminUsersService = module.get(AdminUsersService);
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
      betaAccessApproved: false,
      passwordHash: '',
      calibrationProfileName: null,
      calibrationWeights: null,
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
      betaAccessApproved: false,
      passwordHash,
      calibrationProfileName: null,
      calibrationWeights: null,
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

  it('allows admin users to log in without beta access approval when access code is required', async () => {
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
      betaAccessApproved: false,
      passwordHash,
      calibrationProfileName: null,
      calibrationWeights: null,
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

    adminUsersService.isAdmin.mockResolvedValue(true);

    const result = await service.login(payload);

    expect(result.accessToken).toEqual('signed-token');
    expect(result.user).toMatchObject({
      id: savedUser.id,
      email: savedUser.email,
    });
  });
});
