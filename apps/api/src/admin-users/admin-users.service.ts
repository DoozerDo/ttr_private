import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminUser } from './admin-user.entity';
import { AccountType } from '../users/account-type.enum';
import { User } from '../users/user.entity';

export type AdminUserSummary = {
  id: string;
  email: string;
  createdAt: Date;
  accountType: AccountType;
};

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AdminUser)
    private readonly adminUsersRepository: Repository<AdminUser>,
  ) {}

  async listUsers(): Promise<AdminUserSummary[]> {
    return this.usersRepository.find({
      select: ['id', 'email', 'createdAt', 'accountType'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateUserAccountType(
    userId: string,
    accountType: AccountType,
  ): Promise<AdminUserSummary> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.accountType = accountType;
    const updated = await this.usersRepository.save(user);

    return {
      id: updated.id,
      email: updated.email,
      createdAt: updated.createdAt,
      accountType: updated.accountType,
    };
  }

  async isAdmin(userId: string): Promise<boolean> {
    if (!userId) {
      return false;
    }

    const count = await this.adminUsersRepository.count({
      where: { userId },
    });

    return count > 0;
  }
}
