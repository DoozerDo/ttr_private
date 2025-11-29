import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: JwtService;

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
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    jest.spyOn(jwtService, 'sign').mockReturnValue('signed-token');
  });

  it('registers a user and returns a token', async () => {
    const payload: RegisterDto = { email: 'user@example.com', password: 'Password123' };
    const savedUser: User = {
      id: 'user-id',
      email: payload.email,
      passwordHash: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockImplementation(async (email, passwordHash) => ({
      ...savedUser,
      email,
      passwordHash,
    }));

    const result = await service.register(payload);
    const hashedPasswordArg = usersService.create.mock.calls[0][1];

    expect(hashedPasswordArg).not.toEqual(payload.password);
    expect(result.accessToken).toEqual('signed-token');
    expect(result.user).toMatchObject({ id: savedUser.id, email: savedUser.email });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('logs in a user with valid credentials', async () => {
    const payload: LoginDto = { email: 'user@example.com', password: 'Password123' };
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const savedUser: User = {
      id: 'user-id',
      email: payload.email,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    usersService.findByEmail.mockResolvedValue(savedUser);

    const result = await service.login(payload);

    expect(result.accessToken).toEqual('signed-token');
    expect(result.user).toMatchObject({ id: savedUser.id, email: savedUser.email });
  });
});
