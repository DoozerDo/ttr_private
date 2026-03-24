import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { User } from './user.entity';
import { AccountType } from './account-type.enum';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';

@Injectable()
export class UsersService {
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

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
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
}
