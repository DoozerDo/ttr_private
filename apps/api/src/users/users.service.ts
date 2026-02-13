import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { User } from './user.entity';
import { AccountType } from './account-type.enum';

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
  }): Promise<User> {
    const user = this.usersRepository.create({
      email: input.email,
      passwordHash: input.passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      emailConfirmed: input.emailConfirmed,
      // VERIFY: Confirm null calibration defaults are desired on signup.
      calibrationProfileName: null,
      calibrationWeights: null,
      role: 'user',
      subscriptionTier: SubscriptionTier.FREE,
      accountType: AccountType.FREE,
    });
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

  async setEmailConfirmed(userId: string): Promise<void> {
    await this.usersRepository.update({ id: userId }, { emailConfirmed: true });
  }
}
