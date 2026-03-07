import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { ExpandedFitAssessment } from '../analysis/expanded-fit-assessment.entity';
import { AnalysisService } from '../analysis/analysis.service';
import { FitScoringService } from '../analysis/fit-scoring.service';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { ComplianceModule } from '../compliance/compliance.module';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { Interview } from './interview.entity';
import { InterviewToolkitController } from './interview-toolkit.controller';
import { InterviewToolkitService } from './interview-toolkit.service';
import { InterviewRecordsController } from './interview-records.controller';
import { InterviewRecordsService } from './interview-records.service';
import { RecommendedAdditionsService } from './recommended-additions.service';
import { InterviewResponse } from './interview-response.entity';
import { InterviewSession } from './interview-session.entity';
import { InterviewAcceptedAddition } from './interview-accepted-addition.entity';
import { GapDetectionService } from './gap-detection.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { StarStory } from '../star-stories/star-story.entity';
import { BaselineVersionService } from '../baseline/baseline-version.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InterviewSession,
      InterviewResponse,
      Interview,
      InterviewAcceptedAddition,
      Job,
      FitAssessment,
      Baseline,
      BaselineSection,
      BaselineVersion,
      BaselineBlockPolicy,
      ExpandedFitAssessment,
      User,
      StarStory,
    ]),
    ComplianceModule,
  ],
  controllers: [
    InterviewsController,
    InterviewRecordsController,
    InterviewToolkitController,
  ],
  providers: [
    InterviewsService,
    InterviewRecordsService,
    GapDetectionService,
    InterviewQuestionGeneratorService,
    InterviewToolkitService,
    RecommendedAdditionsService,
    BaselineVersionService,
    AnalysisService,
    FitScoringService,
    GapAnalysisService,
  ],
  exports: [InterviewsService, InterviewRecordsService],
})
export class InterviewsModule {}
