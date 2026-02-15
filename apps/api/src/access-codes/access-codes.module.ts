import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { AccessCodesController } from './access-codes.controller';
import { AccessCodesService } from './access-codes.service';
import { AccessCode } from './access-code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccessCode]), UsersModule, AdminUsersModule],
  controllers: [AccessCodesController],
  providers: [AccessCodesService],
  exports: [AccessCodesService],
})
export class AccessCodesModule {}
