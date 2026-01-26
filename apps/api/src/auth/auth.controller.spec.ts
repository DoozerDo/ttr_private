import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  it('handles registration', async () => {
    const dto: RegisterDto = {
      email: 'test@example.com',
      password: 'Password123',
    };
    const response = {
      user: { id: '1', email: dto.email },
      accessToken: 'token',
    };
    authService.register.mockResolvedValue(response);
    const res = { cookie: jest.fn() };

    const result = await controller.register(dto, res as any);

    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(res.cookie).toHaveBeenCalledWith(
      'ttr_token',
      response.accessToken,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(result).toEqual(response);
  });

  it('handles login', async () => {
    const dto: LoginDto = {
      email: 'test@example.com',
      password: 'Password123',
    };
    const response = {
      user: { id: '1', email: dto.email },
      accessToken: 'token',
    };
    authService.login.mockResolvedValue(response);
    const res = { cookie: jest.fn() };

    const result = await controller.login(dto, res as any);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(res.cookie).toHaveBeenCalledWith(
      'ttr_token',
      response.accessToken,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(result).toEqual(response);
  });

  it('handles logout', () => {
    const res = { cookie: jest.fn() };

    const result = controller.logout(res as any);

    expect(res.cookie).toHaveBeenCalledWith(
      'ttr_token',
      '',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      }),
    );
    expect(result).toEqual({ ok: true });
  });
});
