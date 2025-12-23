import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { FitAssessment } from './fit-assessment.entity';
import { AnalysisController } from './analysis.controller';
import { CalibrationController } from './calibration.controller';
import { AnalysisService } from './analysis.service';
import { FitScoringService } from './fit-scoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Baseline, BaselineSection, Job, FitAssessment, User]),
  ],
  controllers: [AnalysisController, CalibrationController],
  providers: [AnalysisService, FitScoringService],
})
export class AnalysisModule {}
