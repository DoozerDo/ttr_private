import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { ExpandedFitAssessment } from '../analysis/expanded-fit-assessment.entity';
import { AnalysisModule } from '../analysis/analysis.module';
import { Application } from '../applications/application.entity';
import { BetaFeedback } from '../beta-feedback/beta-feedback.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Baseline } from '../baseline/baseline.entity';
import { CoverLettersModule } from '../cover-letters/cover-letters.module';
import { CoverLetter } from '../cover-letters/cover-letter.entity';
import { Interview } from '../interviews/interview.entity';
import { JobTrackerEntry } from '../job-tracker/job-tracker-entry.entity';
import { Job } from '../jobs/job.entity';
import { JobsModule } from '../jobs/jobs.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ResumeModule } from '../resume/resume.module';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { SyntheticCleanupController } from './synthetic-cleanup.controller';
import { SyntheticCleanupRun } from './synthetic-cleanup-run.entity';
import { SyntheticCleanupScheduler } from './synthetic-cleanup.scheduler';
import { SyntheticCleanupService } from './synthetic-cleanup.service';
import { SyntheticConfigService } from './synthetic-config.service';
import { SyntheticTransactionRunnerService } from './synthetic-transaction-runner.service';
import { SyntheticTransactionsController } from './synthetic-transactions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SyntheticCleanupRun,
      User,
      Baseline,
      BaselineVersion,
      BaselineSection,
      BaselineBlockPolicy,
      BaselineParsed,
      Job,
      FitAssessment,
      ExpandedFitAssessment,
      Interview,
      Opportunity,
      Application,
      CoverLetter,
      JobTrackerEntry,
      BetaFeedback,
    ]),
    AdminUsersModule,
    UsersModule,
    JobsModule,
    AnalysisModule,
    ResumeModule,
    CoverLettersModule,
    OpportunitiesModule,
  ],
  controllers: [SyntheticCleanupController, SyntheticTransactionsController],
  providers: [
    SyntheticConfigService,
    SyntheticCleanupService,
    SyntheticCleanupScheduler,
    SyntheticTransactionRunnerService,
  ],
  exports: [
    SyntheticConfigService,
    SyntheticCleanupService,
    SyntheticTransactionRunnerService,
  ],
})
export class SyntheticModule {}
