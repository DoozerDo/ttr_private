import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminUser } from './admin-user.entity';
import { User } from '../users/user.entity';
import { AccountType } from '../users/account-type.enum';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectRepository(AdminUser)
    private readonly adminRepo: Repository<AdminUser>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Used by AdminBypassGuard
   */
  async isAdmin(userId: string): Promise<boolean> {
    try {
      const count = await this.adminRepo.count({
        where: { userId },
      });
      return count > 0;
    } catch (err) {
      this.logger.warn(
        `isAdmin failed for userId=${userId}. Defaulting to false.`,
      );
      return false;
    }
  }

  /**
   * GET /admin/users
   */
  async listUsers() {
    try {
      return await this.userRepo.find({
        select: ['id', 'email', 'accountType', 'createdAt', 'updatedAt'],
        order: {
          createdAt: 'DESC',
        },
      });
    } catch (err) {
      this.logger.error('listUsers failed', err);
      throw err;
    }
  }

  /**
   * PATCH /admin/users/:id
   */
  async updateUserAccountType(userId: string, accountType: AccountType) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.accountType = accountType;
    await this.userRepo.save(user);

    return {
      id: user.id,
      accountType: user.accountType,
    };
  }
}
