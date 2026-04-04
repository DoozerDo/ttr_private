import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Job } from '../jobs/job.entity';
import { RealityCheck } from './reality-check.entity';
import { RealityCheckController } from './reality-check.controller';
import { RealityCheckRepository } from './reality-check.repository';
import { RealityCheckService } from './reality-check.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RealityCheck, Baseline, BaselineSection, Job]),
  ],
  controllers: [RealityCheckController],
  providers: [RealityCheckService, RealityCheckRepository],
})
export class RealityCheckModule {}
