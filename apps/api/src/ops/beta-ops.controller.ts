import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AccessCodesService } from '../access-codes/access-codes.service';
import { UsersService } from '../users/users.service';
import { isFounderEmail } from '../auth/founder-access';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';

class ProvisionBetaAccessDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

class RevokeBetaAccessDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

function ensureFounderOrThrow(config: ConfigService, user?: AuthUserDto) {
  const email = user?.email?.trim() || '';
  if (!email) {
    throw new ForbiddenException('Founder access required');
  }
  if (!isFounderEmail(email, config.get<string>('FOUNDER_EMAILS'))) {
    throw new ForbiddenException('Founder access required');
  }
}

function validateDto<T>(cls: new () => T, raw: unknown): T {
  const dto = plainToInstance(cls, raw ?? {});
  const errors = validateSync(dto as any, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    throw new BadRequestException('Invalid request payload');
  }
  return dto;
}

/**
 * Production-safe beta operations endpoints.
 *
 * Security boundary:
 * - Authenticated (JWT required)
 * - Founder allowlist required (`FOUNDER_EMAILS`)
 *
 * These endpoints intentionally avoid exposing a general admin console surface.
 */
@Controller('ops/beta')
@UseGuards(AuthGuard('jwt'))
export class BetaOpsController {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly accessCodesService: AccessCodesService,
  ) {}

  @Post('provision')
  async provision(@Body() body: unknown, @Req() req: { user?: AuthUserDto }) {
    ensureFounderOrThrow(this.config, req.user);
    const dto = validateDto(ProvisionBetaAccessDto, body);
    const email = dto.email.trim().toLowerCase();

    const user = await this.usersService.findByEmail(email);
    if (!user?.id) {
      throw new BadRequestException(
        'User not found. Ask the tester to sign up first, then provision access.',
      );
    }

    const createdByUserId = req.user?.userId ?? req.user?.id;
    const created = await this.accessCodesService.generateCode({
      assignedUserId: user.id,
      notes: dto.notes,
      createdByUserId,
    });

    return {
      ok: true,
      userId: user.id,
      email,
      accessCodeId: created.id,
      accessCode: created.code,
      status: 'assigned',
    };
  }

  @Post('revoke')
  async revoke(@Body() body: unknown, @Req() req: { user?: AuthUserDto }) {
    ensureFounderOrThrow(this.config, req.user);
    const dto = validateDto(RevokeBetaAccessDto, body);
    const email = dto.email.trim().toLowerCase();

    const user = await this.usersService.findByEmail(email);
    if (!user?.id) {
      throw new BadRequestException('User not found');
    }

    const revokedByUserId = req.user?.userId ?? req.user?.id;
    const revoked = await this.accessCodesService.revokeAllForUser(user.id, {
      revokedByUserId,
      reason: dto.reason,
    });

    return {
      ok: true,
      userId: user.id,
      email,
      revokedCount: revoked.revokedCount,
      alreadyRevokedCount: revoked.alreadyRevokedCount,
    };
  }

  @Get('status')
  async status(@Query('email') emailRaw: string, @Req() req: { user?: AuthUserDto }) {
    ensureFounderOrThrow(this.config, req.user);
    const email = (emailRaw ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('email query param is required');
    }

    const user = await this.usersService.findByEmail(email);
    if (!user?.id) {
      return { ok: true, email, user: null };
    }

    const active = await this.accessCodesService.userHasActiveAccess(user.id);
    const rows = await this.accessCodesService.listCodesForUser(user.id);

    return {
      ok: true,
      email,
      user: { id: user.id, email: user.email },
      hasActiveAccess: active,
      codes: rows.map((row) => this.accessCodesService.toAdminListRow(row)),
    };
  }
}

