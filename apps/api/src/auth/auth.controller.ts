import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthUserDto } from './dto/auth-response.dto';

const AUTH_COOKIE_NAME = 'ttr_token';
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() payload: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const response = await this.authService.register(payload);
    if (response.accessToken) {
      this.setAuthCookie(res, response.accessToken);
    }
    return response;
  }

  @Post('login')
  async login(@Body() payload: LoginDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.login(payload);
    this.setAuthCookie(res, response.accessToken);
    return response;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.cookie(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: true,
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
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
  }
}
