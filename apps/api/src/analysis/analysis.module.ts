import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Job } from '../jobs/job.entity';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [TypeOrmModule.forFeature([Baseline, BaselineSection, Job])],
  controllers: [AnalysisController],
  providers: [AnalysisService],
})
export class AnalysisModule {}
