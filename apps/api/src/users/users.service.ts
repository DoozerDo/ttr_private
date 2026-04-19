import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { User } from './user.entity';
import { AccountType } from './account-type.enum';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';
import {
  findUserByEmailSchemaSafe,
  findUserByIdSchemaSafe,
} from './beta-access-schema-compat';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    emailConfirmed: boolean;
  }, syntheticMetadata?: SyntheticMetadataInput): Promise<User> {
    const user = this.usersRepository.create({
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      emailConfirmed: input.emailConfirmed,
      // VERIFY: Confirm null calibration defaults are desired on signup.
      calibrationProfileName: null,
      calibrationWeights: null,
      roleTitle: null,
      company: null,
      linkedinUrl: null,
      intendedUse: null,
      studioResumeFocusDefault: null,
      profileCompletedAt: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
    });
    if (syntheticMetadata?.isSynthetic) {
      applySyntheticMetadata(user, syntheticMetadata);
    }
    return this.usersRepository.save(user);
  }

  private readonly schemaSafeSelectWithoutBeta = [
    'user.id',
    'user.email',
    'user.firstName',
    'user.lastName',
    'user.passwordHash',
    'user.emailConfirmed',
    'user.calibrationProfileName',
    'user.calibrationWeights',
    'user.roleTitle',
    'user.company',
    'user.linkedinUrl',
    'user.intendedUse',
    'user.studioResumeFocusDefault',
    'user.lastAssessmentId',
    'user.profileCompletedAt',
    'user.role',
    'user.subscriptionTier',
    'user.accountType',
    'user.isSynthetic',
    'user.syntheticScenarioKey',
    'user.syntheticRunId',
    'user.syntheticCreatedAt',
    'user.preserveFromCleanup',
    'user.createdAt',
    'user.updatedAt',
  ];

  async findByEmail(email: string): Promise<User | null> {
    return findUserByEmailSchemaSafe({
      repo: this.usersRepository,
      logger: this.logger,
      email,
      operation: 'UsersService.findByEmail',
      select: this.schemaSafeSelectWithoutBeta,
    });
  }

  async findById(id: string): Promise<User | null> {
    return findUserByIdSchemaSafe({
      repo: this.usersRepository,
      logger: this.logger,
      userId: id,
      operation: 'UsersService.findById',
      select: this.schemaSafeSelectWithoutBeta,
    });
  }

  async updateSubscriptionTier(
    userId: string,
    tier: SubscriptionTier,
  ): Promise<User> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.subscriptionTier = tier;
    return this.usersRepository.save(user);
  }


  async updateMyProfile(
    userId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      roleTitle?: string | null;
      company?: string | null;
      linkedinUrl?: string | null;
      intendedUse?: string | null;
      studioResumeFocusDefault?: string | null;
    },
  ): Promise<User> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (input.firstName !== undefined) {
      user.firstName = input.firstName?.trim() || '';
    }

    if (input.lastName !== undefined) {
      user.lastName = input.lastName?.trim() || '';
    }

    if (input.roleTitle !== undefined) {
      user.roleTitle = input.roleTitle?.trim() || null;
    }

    if (input.company !== undefined) {
      user.company = input.company?.trim() || null;
    }

    if (input.linkedinUrl !== undefined) {
      user.linkedinUrl = input.linkedinUrl?.trim() || null;
    }

    if (input.intendedUse !== undefined) {
      user.intendedUse = input.intendedUse?.trim() || null;
    }

    if (input.studioResumeFocusDefault !== undefined) {
      user.studioResumeFocusDefault =
        input.studioResumeFocusDefault?.trim() || null;
    }

    if (!user.profileCompletedAt && user.roleTitle && user.intendedUse) {
      user.profileCompletedAt = new Date();
    }

    return this.usersRepository.save(user);
  }

  async setEmailConfirmed(userId: string): Promise<void> {
    await this.usersRepository.update({ id: userId }, { emailConfirmed: true });
  }

  async updateLastAssessmentId(
    userId: string,
    assessmentId: string | null,
  ): Promise<User> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.lastAssessmentId = assessmentId;
    return this.usersRepository.save(user);
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.passwordHash = passwordHash;
    return this.usersRepository.save(user);
  }
}
