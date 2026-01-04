import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { Job } from '../jobs/job.entity';
import { Interview } from './interview.entity';
import { InterviewRecordsController } from './interview-records.controller';
import { InterviewRecordsService } from './interview-records.service';
import { InterviewResponse } from './interview-response.entity';
import { InterviewSession } from './interview-session.entity';
import { GapDetectionService } from './gap-detection.service';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InterviewSession,
      InterviewResponse,
      Interview,
      Job,
      Baseline,
      BaselineSection,
      BaselineVersion,
      BaselineBlockPolicy,
    ]),
  ],
  controllers: [InterviewsController, InterviewRecordsController],
  providers: [
    InterviewsService,
    InterviewRecordsService,
    GapDetectionService,
    InterviewQuestionGeneratorService,
  ],
  exports: [InterviewsService, InterviewRecordsService],
})
export class InterviewsModule {}
