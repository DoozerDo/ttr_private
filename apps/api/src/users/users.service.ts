import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { User } from './user.entity';
import { AccountType } from './account-type.enum';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  // Temporary compatibility bridge: Some environments may not have applied the
  // migration that adds `users.betaAccessApproved` yet. When TypeORM selects
  // the missing column, auth/login can fail. This fallback keeps login working
  // by re-querying without that column and defaulting `betaAccessApproved=false`.
  //
  // Remove this once all environments are migrated.
  private hasLoggedMissingBetaColumnWarning = false;

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

  private isMissingBetaColumnError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('betaAccessApproved') &&
      (message.includes('does not exist') || message.includes('unknown column'))
    );
  }

  private logMissingBetaColumnWarningOnce(operation: 'findByEmail' | 'findById') {
    if (this.hasLoggedMissingBetaColumnWarning) {
      return;
    }

    this.hasLoggedMissingBetaColumnWarning = true;
    this.logger.warn(
      `DB schema drift detected: missing users.betaAccessApproved (operation=${operation}). Using temporary fallback query path; apply pending migrations to restore full beta entitlement resolution.`,
    );
  }

  private async findOneWithoutBetaColumn(where: {
    id?: string;
    email?: string;
  }): Promise<User | null> {
    const query = this.usersRepository
      .createQueryBuilder('user')
      .select([
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
      ]);

    if (where.id) {
      query.where('user.id = :id', { id: where.id });
    } else if (where.email) {
      query.where('user.email = :email', { email: where.email });
    } else {
      return null;
    }

    const user = await query.getOne();
    if (user && (user as any).betaAccessApproved === undefined) {
      (user as any).betaAccessApproved = false;
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.usersRepository.findOne({ where: { email } });
    } catch (error) {
      if (!this.isMissingBetaColumnError(error)) {
        throw error;
      }

      this.logMissingBetaColumnWarningOnce('findByEmail');
      // Backward-compatible fallback: allow auth flows to continue even if the DB
      // has not yet been migrated to include `betaAccessApproved`.
      return this.findOneWithoutBetaColumn({ email });
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      return await this.usersRepository.findOne({ where: { id } });
    } catch (error) {
      if (!this.isMissingBetaColumnError(error)) {
        throw error;
      }

      this.logMissingBetaColumnWarningOnce('findById');
      return this.findOneWithoutBetaColumn({ id });
    }
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
