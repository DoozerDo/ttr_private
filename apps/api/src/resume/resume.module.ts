import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceModule } from '../compliance/compliance.module';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { Job } from '../jobs/job.entity';
import { ApplicationsModule } from '../applications/applications.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { SupportModule } from '../support/support.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Baseline,
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
  ],
  controllers: [ResumeController],
  providers: [ResumeService, GapAnalysisService],
  exports: [ResumeService],
})
export class ResumeModule {}
