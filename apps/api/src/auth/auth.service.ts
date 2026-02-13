import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { RelayEmailService } from '../email/relay-email.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/user.entity';
import { getEntitlementsForTier } from '../features/feature-gates';
import type { AuthResponseDto } from './dto/auth-response.dto';
import { UserToken } from './user-token.entity';

type RegisterResponseDto = {
  success: true;
  message: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly relayEmailService: RelayEmailService,
    private readonly configService: ConfigService,
    @InjectRepository(UserToken)
    private readonly userTokensRepository: Repository<UserToken>,
  ) {}

  async register(payload: RegisterDto): Promise<RegisterResponseDto> {
    if (payload.password !== payload.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const existing = await this.usersService.findByEmail(payload.email);

    if (existing) {
      return {
        success: true,
        message: this.requireEmailConfirmation
          ? 'Check your email to confirm your account.'
          : 'Account created.',
      };
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await this.usersService.create({
      email: payload.email,
      passwordHash,
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      emailConfirmed: !this.requireEmailConfirmation,
    });

    if (!this.requireEmailConfirmation) {
      return { success: true, message: 'Account created.' };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.userTokensRepository.save(
      this.userTokensRepository.create({
        userId: user.id,
        token,
        type: 'confirm',
        expiresAt,
      }),
    );

    const appBaseUrl = this.configService.get<string>('APP_BASE_URL')?.trim();
    const supportEmail =
      this.configService.get<string>('SUPPORT_EMAIL')?.trim() ??
      'support@targetthisrole.ai';
    const confirmUrl = `${appBaseUrl ?? 'http://localhost:3000'}/auth/confirm?token=${encodeURIComponent(token)}`;
    const html = this.renderSignupConfirmationTemplate(confirmUrl, supportEmail);

    await this.relayEmailService.sendRawRelayEmail({
      to: user.email,
      subject: 'Confirm your account',
      body: html,
      replyTo: supportEmail,
      type: 'signup_confirm',
    });

    return {
      success: true,
      message: 'Check your email to confirm your account.',
    };
  }

  async login(payload: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(payload.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(
      payload.password,
      user.passwordHash,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.requireEmailConfirmation && !user.emailConfirmed) {
      throw new ForbiddenException(
        'Please confirm your email before logging in.',
      );
    }

    return this.buildAuthResponse(user);
  }

  async confirmEmail(token: string): Promise<{ success: true; message: string }> {
    if (!token) {
      throw new BadRequestException('Missing confirmation token');
    }
    const match = await this.userTokensRepository.findOne({
      where: { token, type: 'confirm' },
    });

    if (!match || match.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired confirmation token');
    }

    const user = await this.usersService.findById(match.userId);
    if (!user) {
      throw new BadRequestException('Invalid confirmation token');
    }

    await this.usersService.setEmailConfirmed(user.id);
    await this.userTokensRepository.delete({ id: match.id });

    return { success: true, message: 'Email confirmed. You can now log in.' };
  }

  private get requireEmailConfirmation(): boolean {
    const raw = this.configService.get<string>('REQUIRE_EMAIL_CONFIRMATION');
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private renderSignupConfirmationTemplate(
    confirmUrl: string,
    supportEmail: string,
  ): string {
    const candidatePaths = [
      join(process.cwd(), 'src', 'emailTemplates', 'signup-confirmation.html'),
      '/usr/src/app/src/emailTemplates/signup-confirmation.html',
    ];
    const templatePath =
      candidatePaths.find((path) => existsSync(path)) ?? candidatePaths[0];
    const template = readFileSync(templatePath, 'utf-8');
    return template
      .replaceAll('{{confirm_url}}', confirmUrl)
      .replaceAll('{{support_email}}', supportEmail);
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const entitlements = getEntitlementsForTier(user.subscriptionTier);

    const payload = {
      sub: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      entitlements,
    };

    const accessToken = this.jwtService.sign(payload);

    const { passwordHash, ...sanitizedUser } = user;

    const stableId = sanitizedUser.id ?? user.id;

    return {
      accessToken,
      user: {
        ...sanitizedUser,
        id: stableId,
        userId: stableId,
        entitlements,
      },
    };
  }
}
