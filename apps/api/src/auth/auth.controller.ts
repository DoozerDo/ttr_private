import {
  Body,
  Controller,
  HttpException,
  InternalServerErrorException,
  Logger,
  Get,
  Query,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RedeemAccessCodeAndLoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import type { AuthUserDto } from './dto/auth-response.dto';

const AUTH_COOKIE_NAME = 'access_token';
const AUTH_COOKIE_MAX_AGE_MS = 60 * 60 * 1000;
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const COOKIE_IS_SECURE = NODE_ENV === 'production';

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() payload: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.register(payload);
    return response;
  }

  @Get('confirm')
  async confirmEmail(@Query('token') token: string) {
    return this.authService.confirmEmail(token);
  }


  @Post('resend-confirmation')
  async resendConfirmation(@Body() payload: ResendConfirmationDto) {
    return this.authService.resendConfirmation(payload.email);
  }

  @Post('login')
  async login(
    @Body() payload: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log(
      `AuthController.login entered email=${payload.email?.trim()?.toLowerCase() ?? 'unknown'}`,
    );
    try {
      const response = await this.authService.login(payload);
      this.setAuthCookie(res, response.accessToken);
      return response;
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(
          `AuthController.login failed with controlled error status=${error.getStatus()} message=${error.message}`,
        );
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `AuthController.login failed unexpectedly message=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Login failed due to unexpected controller error.',
      );
    }
  }


  @Post('redeem-access-code-and-login')
  async redeemAccessCodeAndLogin(
    @Body() payload: RedeemAccessCodeAndLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.redeemAccessCodeAndLogin(payload);
    this.setAuthCookie(res, response.accessToken);
    return response;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.cookie(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: COOKIE_IS_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return { ok: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() request: { user?: AuthUserDto }) {
    return { user: request.user };
  }

  private setAuthCookie(res: Response, accessToken: string) {
    res.cookie(AUTH_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: COOKIE_IS_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
  }
}
