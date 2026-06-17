import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceModule } from '../compliance/compliance.module';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { ApplicationsModule } from '../applications/applications.module';
import { CoverLetter } from './cover-letter.entity';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';
import { WorkflowIdempotencyModule } from '../common/workflow-idempotency.module';
import { StudioArtifactsModule } from '../studio-artifacts/studio-artifacts.module';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineResumeV2BackfillService } from '../baseline/baseline-resume-v2-backfill.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CoverLetter, BaselineParsed]),
    ComplianceModule,
    ApplicationsModule,
    WorkflowIdempotencyModule,
    forwardRef(() => StudioArtifactsModule),
  ],
  controllers: [CoverLettersController],
  providers: [CoverLettersService, GapAnalysisService, BaselineResumeV2BackfillService],
  exports: [CoverLettersService],
})
export class CoverLettersModule {}
