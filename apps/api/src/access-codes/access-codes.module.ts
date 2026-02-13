import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { User } from '../users/user.entity';
import { AccessCodesController } from './access-codes.controller';
import { AccessCodesService } from './access-codes.service';
import { BetaAccessCode } from './beta-access-code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BetaAccessCode, User]), UsersModule, AdminUsersModule],
  controllers: [AccessCodesController],
  providers: [AccessCodesService],
  exports: [AccessCodesService],
})
export class AccessCodesModule {}
