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
    const dto: RegisterDto = { email: 'test@example.com', password: 'Password123' };
    const response = { user: { id: '1', email: dto.email }, accessToken: 'token' };
    authService.register.mockResolvedValue(response);

    const result = await controller.register(dto);

    expect(authService.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual(response);
  });

  it('handles login', async () => {
    const dto: LoginDto = { email: 'test@example.com', password: 'Password123' };
    const response = { user: { id: '1', email: dto.email }, accessToken: 'token' };
    authService.login.mockResolvedValue(response);

    const result = await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual(response);
  });
});
