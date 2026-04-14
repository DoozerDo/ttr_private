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
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ResumeModule } from '../resume/resume.module';
import { ResumeService } from '../resume/resume.service';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { SyntheticCleanupController } from './synthetic-cleanup.controller';
import { SyntheticCleanupRun } from './synthetic-cleanup-run.entity';
import { SyntheticCleanupScheduler } from './synthetic-cleanup.scheduler';
import { SyntheticCleanupService } from './synthetic-cleanup.service';
import { SyntheticConfigService } from './synthetic-config.service';
import { SyntheticReliabilityController } from './synthetic-reliability.controller';
import { SyntheticIngestGuard } from './synthetic-ingest.guard';
import { SyntheticReliabilityService } from './synthetic-reliability.service';
import { SyntheticUserTokenLinkService } from './synthetic-user-token-link.service';
import { SYNTHETIC_TRANSACTION_RUNNER_DEPS, SyntheticTransactionRunnerService } from './synthetic-transaction-runner.service';
import { SyntheticTransactionsController } from './synthetic-transactions.controller';
import { UserToken } from '../auth/user-token.entity';
import { JobsService } from '../jobs/jobs.service';
import { AnalysisService } from '../analysis/analysis.service';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SyntheticCleanupRun,
      User,
      UserToken,
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
  controllers: [SyntheticCleanupController, SyntheticTransactionsController, SyntheticReliabilityController],
  providers: [
    SyntheticConfigService,
    SyntheticCleanupService,
    SyntheticIngestGuard,
    SyntheticReliabilityService,
    SyntheticUserTokenLinkService,
    SyntheticCleanupScheduler,
    {
      provide: SYNTHETIC_TRANSACTION_RUNNER_DEPS,
      useFactory: (
        usersService: UsersService,
        jobsService: JobsService,
        analysisService: AnalysisService,
        resumeService: ResumeService,
        coverLettersService: CoverLettersService,
        opportunitiesService: OpportunitiesService | undefined,
        userRepository: Repository<User>,
        baselineRepository: Repository<Baseline>,
        baselineSectionRepository: Repository<BaselineSection>,
        baselineVersionRepository: Repository<BaselineVersion>,
        baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
        jobRepository: Repository<Job>,
        fitAssessmentRepository: Repository<FitAssessment>,
        coverLetterRepository: Repository<CoverLetter>,
        opportunityRepository: Repository<Opportunity>,
        applicationRepository: Repository<Application>,
        syntheticRunRepository: Repository<SyntheticCleanupRun>,
      ) => ({
        usersService,
        jobsService,
        analysisService,
        resumeService,
        coverLettersService,
        opportunitiesService,
        userRepository,
        baselineRepository,
        baselineSectionRepository,
        baselineVersionRepository,
        baselineBlockPolicyRepository,
        jobRepository,
        fitAssessmentRepository,
        coverLetterRepository,
        opportunityRepository,
        applicationRepository,
        syntheticRunRepository,
      }),
      inject: [
        UsersService,
        JobsService,
        AnalysisService,
        ResumeService,
        CoverLettersService,
        { token: OpportunitiesService, optional: true } as any,
        getRepositoryToken(User),
        getRepositoryToken(Baseline),
        getRepositoryToken(BaselineSection),
        getRepositoryToken(BaselineVersion),
        getRepositoryToken(BaselineBlockPolicy),
        getRepositoryToken(Job),
        getRepositoryToken(FitAssessment),
        getRepositoryToken(CoverLetter),
        getRepositoryToken(Opportunity),
        getRepositoryToken(Application),
        getRepositoryToken(SyntheticCleanupRun),
      ],
    },
    SyntheticTransactionRunnerService,
  ],
  exports: [
    SyntheticConfigService,
    SyntheticCleanupService,
    SyntheticReliabilityService,
    SyntheticTransactionRunnerService,
  ],
})
export class SyntheticModule {}
