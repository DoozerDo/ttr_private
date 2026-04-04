import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceModule } from '../compliance/compliance.module';
import { JobTrackerEntry } from './job-tracker-entry.entity';
import { JobTrackerController } from './job-tracker.controller';
import { JobTrackerService } from './job-tracker.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobTrackerEntry]), ComplianceModule],
  controllers: [JobTrackerController],
  providers: [JobTrackerService],
})
export class JobTrackerModule {}
