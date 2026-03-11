import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsEvent } from './analytics-event.entity';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([AnalyticsEvent]), AdminUsersModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
