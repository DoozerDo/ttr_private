import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
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
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    };
    const response = { success: true, message: 'Check your email to confirm your account.' };
    authService.register.mockResolvedValue(response);
    const res = { cookie: jest.fn() };

    const result = await controller.register(dto, res as any);

    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(res.cookie).not.toHaveBeenCalled();
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
      'access_token',
      response.accessToken,
      expect.objectContaining({
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
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
      'access_token',
      '',
      expect.objectContaining({
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('rethrows controlled login errors', async () => {
    const dto: LoginDto = {
      email: 'test@example.com',
      password: 'Password123',
    };
    authService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));
    const res = { cookie: jest.fn() };

    await expect(controller.login(dto, res as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('maps unexpected login errors to InternalServerErrorException', async () => {
    const dto: LoginDto = {
      email: 'test@example.com',
      password: 'Password123',
    };
    authService.login.mockRejectedValue(new Error('unexpected failure'));
    const res = { cookie: jest.fn() };

    await expect(controller.login(dto, res as any)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
