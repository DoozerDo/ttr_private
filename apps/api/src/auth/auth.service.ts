import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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
import { ResendEmailService } from '../email/resend-email.service';
import { UsersService } from '../users/users.service';
import { LoginDto, RedeemAccessCodeAndLoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/user.entity';
import { getEntitlementsForTier } from '../features/feature-gates';
import type { AuthResponseDto } from './dto/auth-response.dto';
import { UserToken } from './user-token.entity';
import { AccessCodesService } from '../access-codes/access-codes.service';
import { AdminUsersService } from '../admin-users/admin-users.service';
import {
  buildConfirmationUrl,
  resolvePublicWebBaseUrl,
} from './confirm-url';

type RegisterResponseDto = {
  success: true;
  message: string;
  emailConfirmationRequired: boolean;
};

type ResendConfirmationResponseDto = {
  success: true;
  message: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly publicWebBaseUrl: string;
  private readonly supportEmail: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly resendEmailService: ResendEmailService,
    private readonly configService: ConfigService,
    @InjectRepository(UserToken)
    private readonly userTokensRepository: Repository<UserToken>,
    private readonly accessCodesService: AccessCodesService,
    private readonly adminUsersService: AdminUsersService,
  ) {
    this.publicWebBaseUrl = resolvePublicWebBaseUrl({
      nodeEnv: this.configService.get<string>('NODE_ENV'),
      appPublicWebUrl: this.configService.get<string>('APP_PUBLIC_WEB_URL'),
    });
    const configuredSupportEmail =
      this.configService.get<string>('SUPPORT_EMAIL')?.trim() ?? '';
    this.supportEmail = configuredSupportEmail || 'support@targetthisrole.com';
  }

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
        emailConfirmationRequired: this.requireEmailConfirmation,
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
      return {
        success: true,
        message: 'Account created.',
        emailConfirmationRequired: false,
      };
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

    const confirmUrl = buildConfirmationUrl(this.publicWebBaseUrl, token);
    const html = this.renderSignupConfirmationTemplate(
      confirmUrl,
      this.supportEmail,
    );

    await this.sendConfirmationEmail(user.email, html, this.supportEmail);

    return {
      success: true,
      message: 'Check your email to confirm your account.',
      emailConfirmationRequired: true,
    };
  }

  async login(payload: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateCredentials(payload);

    const isAdmin = await this.adminUsersService.isAdmin(user.id);

    if (this.requireAccessCode && !isAdmin) {
      const hasActiveAccess = await this.accessCodesService.userHasActiveAccess(
        user.id,
      );

      if (!hasActiveAccess) {
        const redeemedAssignedCode =
          await this.accessCodesService.redeemAssignedCodeForUser(user);

        if (!redeemedAssignedCode) {
          throw new ForbiddenException({
            code: 'ACCESS_CODE_REQUIRED',
            message: 'Access code required.',
          });
        }
      }
    }

    return this.buildAuthResponse(user);
  }


  async redeemAccessCodeAndLogin(
    payload: RedeemAccessCodeAndLoginDto,
  ): Promise<AuthResponseDto> {
    const user = await this.validateCredentials(payload);

    await this.accessCodesService.redeemCodeForUser(user, payload.code);

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

  async resendConfirmation(
    email: string,
  ): Promise<ResendConfirmationResponseDto> {
    this.logger.log(`Confirmation resend requested for ${email}`);

    const successMessage = {
      success: true,
      message: 'If this email exists, a new confirmation email has been sent.',
    } as const;

    if (!this.requireEmailConfirmation) {
      this.logger.log(
        `Skipping confirmation resend for ${email} because email confirmation is disabled.`,
      );
      return successMessage;
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.log(
        `Confirmation resend no-op for ${email}: user not found.`,
      );
      return successMessage;
    }

    if (user.emailConfirmed) {
      this.logger.log(
        `Confirmation resend no-op for ${email}: email already confirmed.`,
      );
      return successMessage;
    }

    await this.userTokensRepository.delete({ userId: user.id, type: 'confirm' });

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

    const confirmUrl = buildConfirmationUrl(this.publicWebBaseUrl, token);
    const html = this.renderSignupConfirmationTemplate(
      confirmUrl,
      this.supportEmail,
    );

    await this.sendConfirmationEmail(user.email, html, this.supportEmail);

    return successMessage;
  }


  private async validateCredentials(payload: LoginDto): Promise<User> {
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

    return user;
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

  private get requireAccessCode(): boolean {
    return this.configService.get<string>('REQUIRE_ACCESS_CODE') === 'true';
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

  private async sendConfirmationEmail(
    email: string,
    html: string,
    replyTo: string,
  ): Promise<void> {
    try {
      await this.resendEmailService.sendEmail({
        to: email,
        subject: 'Confirm your account',
        html,
        replyTo,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send confirmation email to ${email}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new HttpException(
        'Unable to send confirmation email. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
