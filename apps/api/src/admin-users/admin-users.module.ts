import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminBypassGuard } from './admin-bypass.guard';
import { AdminUser } from './admin-user.entity';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, AdminUser])],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, AdminBypassGuard],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
