import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
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
import { getEntitlementsForUser } from '../features/feature-gates';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import type { AuthResponseDto } from './dto/auth-response.dto';
import { UserToken } from './user-token.entity';
import { AccessCodesService } from '../access-codes/access-codes.service';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { resolveAccountPrivileges } from './account-privileges';
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

type ForgotPasswordResponseDto = {
  success: true;
  message: string;
};

type ResetPasswordResponseDto = {
  success: true;
  message: string;
};

type ChangePasswordResponseDto = {
  success: true;
  message: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly publicWebBaseUrl: string;
  private readonly supportEmail: string;
  private registrationNotifyEmailMissingLogged = false;

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
    const normalizedEmail = payload.email?.trim().toLowerCase() ?? '';
    try {
      if (payload.password !== payload.confirmPassword) {
        throw new BadRequestException('Passwords do not match');
      }

      const existing = await this.usersService.findByEmail(normalizedEmail);

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
        email: normalizedEmail,
        passwordHash,
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        emailConfirmed: !this.requireEmailConfirmation,
      });
      await this.notifyNewRegistration(user);

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
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(
          `[register] controlled error status=${error.getStatus()} email=${normalizedEmail || 'unknown'} message=${error.message}`,
        );
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[register] unexpected error email=${normalizedEmail || 'unknown'} message=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Signup failed due to an unexpected server error. Please try again.',
      );
    }
  }

  async login(payload: LoginDto): Promise<AuthResponseDto> {
    this.logger.log(
      `Login attempt started email=${payload.email?.trim()?.toLowerCase() ?? 'unknown'}`,
    );
    try {
      this.ensureLoginConfig();
      const user = await this.validateCredentials(payload);
      this.logger.log(
        `Login user lookup + password validation passed userId=${user.id ?? 'unknown'}`,
      );

      const privileges = await this.resolveLoginPrivileges(user);
      if (privileges.isFounder) {
        this.logger.log(`Founder override applied for ${user.email}`);
      }
      if (privileges.isAdmin) {
        this.logger.log(`Admin capability override applied for ${user.email}`);
      }

      this.logger.log(
        `Login access code enforcement check requireAccessCode=${this.requireAccessCode} isFounder=${privileges.isFounder} isAdmin=${privileges.isAdmin}`,
      );
      if (this.requireAccessCode && !privileges.isPrivileged) {
        if (!user?.id) {
          throw new ForbiddenException('Access code required');
        }
        const hasActiveAccess = await this.accessCodesService.userHasActiveAccess(
          user.id,
        );

        if (!hasActiveAccess) {
          const redeemedAssignedCode =
            await this.accessCodesService.redeemAssignedCodeForUser(user);

          if (!redeemedAssignedCode) {
            throw new ForbiddenException('Access code required');
          }
        }
      }

      this.logger.log(`Login token generation starting userId=${user.id}`);
      return await this.buildAuthResponse(user, privileges);
    } catch (error) {
      if (error instanceof HttpException) {
        this.logger.warn(
          `Login failed with controlled error status=${error.getStatus()} message=${error.message}`,
        );
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Login failed with unexpected error message=${message}`,
        stack,
      );
      throw new InternalServerErrorException(
        'Login failed due to unexpected server error.',
      );
    }
  }


  async redeemAccessCodeAndLogin(
    payload: RedeemAccessCodeAndLoginDto,
  ): Promise<AuthResponseDto> {
    const user = await this.validateCredentials(payload);

    await this.accessCodesService.redeemCodeForUser(user, payload.code);

    return await this.buildAuthResponse(user);
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

  async requestPasswordReset(email: string): Promise<ForgotPasswordResponseDto> {
    const normalizedEmail = email?.trim().toLowerCase() ?? '';
    this.logger.log(
      `[password-reset] request received for email=${normalizedEmail || 'unknown'}`,
    );

    const successMessage = {
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    } as const;

    const user = await this.usersService.findByEmail(email);
    this.logger.log(
      `[password-reset] user lookup: found=${Boolean(user)}`,
    );

    if (!user) {
      return successMessage;
    }

    await this.userTokensRepository.delete({ userId: user.id, type: 'reset-password' });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.userTokensRepository.save(
      this.userTokensRepository.create({
        userId: user.id,
        token,
        type: 'reset-password',
        expiresAt,
      }),
    );
    this.logger.log(`[password-reset] token created for userId=${user.id}`);

    const resetUrl = `${this.publicWebBaseUrl.replace(/\/$/, '')}/auth/reset-password?token=${token}`;
    const html = [
      `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
      `<p>If you did not request this, you can ignore this email.</p>`,
    ].join('');

    try {
      this.logger.log('[password-reset] attempting email send');
      await this.resendEmailService.sendEmail({
        to: user.email,
        subject: 'Reset your password',
        html,
        replyTo: this.supportEmail,
      });
      this.logger.log('[password-reset] email sent successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[password-reset][error] email send failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (
        (this.configService.get<string>('NODE_ENV') ?? '').trim() !== 'production'
      ) {
        this.logger.warn(`[password-reset][dev-fallback] Reset URL: ${resetUrl}`);
      }
    }

    return successMessage;
  }

  async resetPassword(token: string, password: string): Promise<ResetPasswordResponseDto> {
    if (!token || !password) {
      throw new BadRequestException('Missing reset token or password');
    }

    const match = await this.userTokensRepository.findOne({
      where: { token, type: 'reset-password' },
    });

    if (!match || match.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.usersService.findById(match.userId);
    if (!user) {
      throw new BadRequestException('Invalid reset token');
    }

    await this.usersService.updatePasswordHash(user.id, await bcrypt.hash(password, 10));
    await this.userTokensRepository.delete({ id: match.id });

    return { success: true, message: 'Password reset successfully. You can now log in.' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.passwordHash) {
      throw new BadRequestException('Invalid user context');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.usersService.updatePasswordHash(user.id, await bcrypt.hash(newPassword, 10));

    return { success: true, message: 'Password updated.' };
  }


  private async validateCredentials(payload: LoginDto): Promise<User> {
    this.logger.log(
      `Login credential validation started email=${payload.email?.trim()?.toLowerCase() ?? 'unknown'}`,
    );
    const user = await this.usersService.findByEmail(payload.email);
    this.logger.log(
      `Login user lookup completed found=${Boolean(user)} email=${payload.email?.trim()?.toLowerCase() ?? 'unknown'}`,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let isValidPassword = false;
    try {
      if (!user.passwordHash) {
        throw new UnauthorizedException('Invalid credentials');
      }
      isValidPassword = await bcrypt.compare(payload.password, user.passwordHash);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Login password comparison failed email=${payload.email?.trim()?.toLowerCase() ?? 'unknown'} message=${message}`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.log(
      `Login password validation completed isValidPassword=${isValidPassword} userId=${user.id ?? 'unknown'}`,
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

  private ensureLoginConfig() {
    const appPublicWebUrl =
      this.configService.get<string>('APP_PUBLIC_WEB_URL')?.trim() ?? '';
    if (!appPublicWebUrl) {
      throw new InternalServerErrorException(
        'Missing APP_PUBLIC_WEB_URL environment variable for login.',
      );
    }
    const jwtSecret = this.configService.get<string>('JWT_SECRET')?.trim() ?? '';
    if (!jwtSecret) {
      throw new InternalServerErrorException(
        'Missing JWT_SECRET environment variable for login.',
      );
    }
    const requireAccessCodeRaw =
      this.configService.get<string>('REQUIRE_ACCESS_CODE');
    if (
      requireAccessCodeRaw !== undefined &&
      requireAccessCodeRaw !== 'true' &&
      requireAccessCodeRaw !== 'false'
    ) {
      throw new InternalServerErrorException(
        'Invalid REQUIRE_ACCESS_CODE value. Expected true or false.',
      );
    }
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
    try {
      const template = readFileSync(templatePath, 'utf-8');
      return template
        .replaceAll('{{confirm_url}}', confirmUrl)
        .replaceAll('{{support_email}}', supportEmail);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[confirmation-email][template-fallback] path=${templatePath} reason=${message}`,
      );
      return [
        '<p>Confirm your account by clicking the link below:</p>',
        `<p><a href="${confirmUrl}">Confirm account</a></p>`,
        `<p>If you did not request this, you can ignore this email. Need help? ${supportEmail}</p>`,
      ].join('\n');
    }
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
      const isProduction =
        (this.configService.get<string>('NODE_ENV') ?? '').trim() === 'production';

      if (!isProduction) {
        const confirmUrl = html.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? 'unknown';
        this.logger.warn(
          `[confirmation-email][dev-fallback] email=${email} url=${confirmUrl} reason=${message}`,
        );
        return;
      }

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

  private async notifyNewRegistration(user: User): Promise<void> {
    const notifyEmail =
      this.configService.get<string>('REGISTRATION_NOTIFY_EMAIL')?.trim() ?? '';
    const createdAtIso =
      user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : new Date().toISOString();
    const environmentName =
      this.configService.get<string>('RAILWAY_ENVIRONMENT_NAME')?.trim() ||
      this.configService.get<string>('NODE_ENV')?.trim() ||
      process.env.NODE_ENV ||
      'unknown';

    const fallbackLog = JSON.stringify({
      event: 'registration_success',
      userId: user.id,
      email: user.email,
      createdAt: createdAtIso,
      environment: environmentName,
    });

    if (!notifyEmail) {
      if (!this.registrationNotifyEmailMissingLogged) {
        this.registrationNotifyEmailMissingLogged = true;
        this.logger.warn(
          'REGISTRATION_NOTIFY_EMAIL is not configured. Registration notifications will be logged only.',
        );
      }
      this.logger.log(fallbackLog);
      return;
    }

    try {
      await this.resendEmailService.sendEmail({
        to: notifyEmail,
        subject: 'New TTR registration',
        text: [
          `User email: ${user.email}`,
          `User id: ${user.id}`,
          `Created: ${createdAtIso}`,
          `Environment: ${environmentName}`,
        ].join('\n'),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send registration notification for user ${user.id}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.logger.log(fallbackLog);
    }
  }

  private async buildAuthResponse(
    user: User,
    privileges?: {
      isFounder: boolean;
      isAdmin: boolean;
      isPrivileged: boolean;
    },
  ): Promise<AuthResponseDto> {
    const resolvedPrivileges =
      privileges ?? (await this.resolveLoginPrivileges(user));

    // Canonical rule: beta-approved users resolve to PRO even without a paid tier.
    // Beta approval is sourced from either the durable user flag or an active redeemed access code.
    const betaAccessApproved = resolvedPrivileges.isPrivileged
      ? true
      : user?.id
        ? await this.accessCodesService.resolveBetaAccessApproved({
            userId: user.id,
            betaAccessApproved: user.betaAccessApproved,
          })
        : Boolean(user.betaAccessApproved);

    const entitlements = getEntitlementsForUser({
      subscriptionTier: resolvedPrivileges.isPrivileged
        ? SubscriptionTier.PRO
        : user.subscriptionTier,
      betaAccessApproved,
    });
    const resolvedTier = entitlements.effectiveTier;
    const resolvedRole = resolvedPrivileges.isPrivileged ? 'admin' : user.role;

    const payload = {
      sub: user.id,
      email: user.email,
      subscriptionTier: resolvedTier,
      role: resolvedRole,
      entitlements,
      betaAccessApproved,
    };

    let accessToken: string;
    try {
      accessToken = this.jwtService.sign(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Login token generation failed userId=${user.id} message=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Unable to generate auth token.',
      );
    }

    const { passwordHash, ...sanitizedUser } = user;

    const stableId = sanitizedUser.id ?? user.id;

    return {
      accessToken,
      user: {
        ...sanitizedUser,
        role: resolvedRole,
        subscriptionTier: resolvedTier,
        id: stableId,
        userId: stableId,
        entitlements,
      },
    };
  }

  private async resolveLoginPrivileges(user: Pick<User, 'id' | 'email'>) {
    return resolveAccountPrivileges({
      email: user.email,
      userId: user.id,
      founderEmailsRaw: this.configService.get<string>('FOUNDER_EMAILS'),
      isAdminUser: (userId) => this.adminUsersService.isAdmin(userId),
    });
  }
}
