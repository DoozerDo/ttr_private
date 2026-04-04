import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AccessCode } from './access-code.entity';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSegment(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

@Injectable()
export class AccessCodesService {
  constructor(
    @InjectRepository(AccessCode)
    private readonly accessCodesRepository: Repository<AccessCode>,
    private readonly usersService: UsersService,
  ) {}

  async listCodes(): Promise<AccessCode[]> {
    return this.accessCodesRepository.find({
      order: { createdAt: 'DESC' },
      relations: ['createdBy', 'assignedUser', 'redeemedBy', 'revokedBy'],
    });
  }

  async generateCode(input: {
    assignedUserId?: string;
    notes?: string;
    createdByUserId?: string;
  }) {
    const rawCode = `TTR-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
    const normalized = normalizeCode(rawCode);
    const codeHash = hashCode(normalized);
    const codePrefix = normalized.replaceAll('-', '').slice(0, 8);

    if (input.assignedUserId) {
      const assignedUser = await this.usersService.findById(input.assignedUserId);
      if (!assignedUser) {
        throw new BadRequestException('Assigned user not found');
      }
    }

    const entity = this.accessCodesRepository.create({
      codeHash,
      codePrefix,
      assignedUserId: input.assignedUserId?.trim() || null,
      notes: input.notes?.trim() || null,
      createdByUserId: input.createdByUserId?.trim() || null,
    });

    const saved = await this.accessCodesRepository.save(entity);

    return {
      id: saved.id,
      createdAt: saved.createdAt,
      assignedUserId: saved.assignedUserId,
      notes: saved.notes,
      code: normalized,
      codePrefix,
    };
  }

  async updateCode(
    id: string,
    input: { assignedUserId?: string | null; notes?: string | null },
  ): Promise<AccessCode> {
    const code = await this.accessCodesRepository.findOne({ where: { id } });
    if (!code) {
      throw new NotFoundException('Access code not found');
    }
    if (code.redeemedAt || code.revokedAt) {
      throw new BadRequestException(
        'Cannot update assignment for redeemed or revoked code',
      );
    }

    if (input.assignedUserId !== undefined) {
      const nextAssigned = input.assignedUserId?.trim() || null;
      if (nextAssigned) {
        const assignedUser = await this.usersService.findById(nextAssigned);
        if (!assignedUser) {
          throw new BadRequestException('Assigned user not found');
        }
      }
      code.assignedUserId = nextAssigned;
    }

    if (input.notes !== undefined) {
      code.notes = input.notes?.trim() || null;
    }

    return this.accessCodesRepository.save(code);
  }

  async revokeCode(id: string, revokedByUserId?: string): Promise<AccessCode> {
    const code = await this.accessCodesRepository.findOne({ where: { id } });
    if (!code) {
      throw new NotFoundException('Access code not found');
    }

    if (!code.revokedAt) {
      code.revokedAt = new Date();
      code.revokedByUserId = revokedByUserId?.trim() || null;
    }

    return this.accessCodesRepository.save(code);
  }

  async userHasActiveAccess(userId: string): Promise<boolean> {
    const count = await this.accessCodesRepository
      .createQueryBuilder('accessCode')
      .where('accessCode.redeemedByUserId = :userId', { userId })
      .andWhere('accessCode.redeemedAt IS NOT NULL')
      .andWhere('accessCode.revokedAt IS NULL')
      .getCount();

    return count > 0;
  }

  async redeemCodeForUser(user: User, rawCode: string): Promise<void> {
    const codeHash = hashCode(normalizeCode(rawCode));
    const code = await this.accessCodesRepository.findOne({ where: { codeHash } });

    if (!code) {
      throw new BadRequestException('Invalid access code');
    }

    if (code.revokedAt) {
      throw new BadRequestException('Access code has been revoked');
    }
    if (code.redeemedAt) {
      throw new BadRequestException('Access code has already been redeemed');
    }

    if (code.assignedUserId && code.assignedUserId !== user.id) {
      throw new ForbiddenException('Access code is assigned to a different user');
    }

    code.assignedUserId = code.assignedUserId ?? user.id;
    code.redeemedByUserId = user.id;
    code.redeemedAt = new Date();
    await this.accessCodesRepository.save(code);

  }

  async redeemAssignedCodeForUser(user: User): Promise<boolean> {
    const code = await this.accessCodesRepository.findOne({
      where: {
        assignedUserId: user.id,
        revokedAt: IsNull(),
        redeemedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    if (!code) {
      return false;
    }

    code.redeemedByUserId = user.id;
    code.redeemedAt = new Date();
    await this.accessCodesRepository.save(code);


    return true;
  }

  toAdminListRow(code: AccessCode) {
    const status = code.revokedAt
      ? 'revoked'
      : code.redeemedAt
        ? 'redeemed'
        : code.assignedUserId
          ? 'assigned'
          : 'unused';

    return {
      id: code.id,
      codePrefix: code.codePrefix,
      codeMasked: code.codePrefix
        ? `TTR-${code.codePrefix.slice(0, 4)}-****-****`
        : 'TTR-****-****-****',
      createdAt: code.createdAt,
      createdByUserId: code.createdByUserId,
      createdByEmail: code.createdBy?.email ?? null,
      assignedUserId: code.assignedUserId,
      assignedUserEmail: code.assignedUser?.email ?? null,
      redeemedByUserId: code.redeemedByUserId,
      redeemedByUserEmail: code.redeemedBy?.email ?? null,
      redeemedAt: code.redeemedAt,
      revokedAt: code.revokedAt,
      revokedByUserId: code.revokedByUserId,
      revokedByUserEmail: code.revokedBy?.email ?? null,
      notes: code.notes,
      status,
    };
  }
}
