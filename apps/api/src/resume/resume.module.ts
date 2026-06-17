import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceModule } from '../compliance/compliance.module';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { Job } from '../jobs/job.entity';
import { ApplicationsModule } from '../applications/applications.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { SupportModule } from '../support/support.module';
import { WorkflowIdempotencyModule } from '../common/workflow-idempotency.module';
import { StudioArtifactsModule } from '../studio-artifacts/studio-artifacts.module';
import { BaselineResumeV2BackfillService } from '../baseline/baseline-resume-v2-backfill.service';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Baseline,
      BaselineParsed,
      BaselineSection,
      BaselineVersion,
      BaselineBlockPolicy,
      FitAssessment,
      Job,
    ]),
    ComplianceModule,
    ApplicationsModule,
    OpportunitiesModule,
    SupportModule,
    WorkflowIdempotencyModule,
    forwardRef(() => StudioArtifactsModule),
  ],
  controllers: [ResumeController],
  providers: [ResumeService, GapAnalysisService, BaselineResumeV2BackfillService],
  exports: [ResumeService],
})
export class ResumeModule {}
