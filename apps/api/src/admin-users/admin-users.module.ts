import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminBypassGuard } from './admin-bypass.guard';
import { AdminBaselinesController } from './admin-baselines.controller';
import { AdminCleanupService } from './admin-cleanup.service';
import { AdminJobsController } from './admin-jobs.controller';
import { AdminUser } from './admin-user.entity';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, AdminUser])],
  controllers: [
    AdminUsersController,
    AdminJobsController,
    AdminBaselinesController,
  ],
  providers: [AdminUsersService, AdminCleanupService, AdminBypassGuard],
  exports: [AdminUsersService, AdminBypassGuard],
})
export class AdminUsersModule {}
