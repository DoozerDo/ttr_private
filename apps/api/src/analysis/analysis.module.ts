import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceModule } from '../compliance/compliance.module';
import { Interview } from '../interviews/interview.entity';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { FitAssessment } from './fit-assessment.entity';
import { ExpandedFitAssessment } from './expanded-fit-assessment.entity';
import { AnalysisController } from './analysis.controller';
import { CalibrationController } from './calibration.controller';
import { FitScoresController } from './fit-scores.controller';
import { AnalysisService } from './analysis.service';
import { FitScoringService } from './fit-scoring.service';
import { GapAnalysisService } from './gap-analysis.service';
import { AlignmentHistoryService } from './services/alignment-history.service';
import { CareerGravityService } from './services/career-gravity.service';
import { ScoreSimulatorService } from './services/score-simulator.service';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Baseline,
      BaselineSection,
      BaselineVersion,
      BaselineBlockPolicy,
      Job,
      FitAssessment,
      ExpandedFitAssessment,
      Interview,
      User,
    ]),
    ComplianceModule,
    SupportModule,
  ],
  controllers: [AnalysisController, CalibrationController, FitScoresController],
  providers: [
    AnalysisService,
    FitScoringService,
    GapAnalysisService,
    AlignmentHistoryService,
    CareerGravityService,
    ScoreSimulatorService,
  ],
  exports: [GapAnalysisService, AnalysisService],
})
export class AnalysisModule {}
