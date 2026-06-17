import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { StudioArtifact } from './studio-artifact.entity';
import { StudioArtifactsController } from './studio-artifacts.controller';
import { StudioArtifactsService } from './studio-artifacts.service';
import { BaselineResumeV2BackfillService } from '../baseline/baseline-resume-v2-backfill.service';
import { ResumeModule } from '../resume/resume.module';
import { CoverLettersModule } from '../cover-letters/cover-letters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudioArtifact, Baseline, BaselineVersion, BaselineParsed, FitAssessment, Job]),
    ResumeModule,
    CoverLettersModule,
  ],
  controllers: [StudioArtifactsController],
  providers: [StudioArtifactsService, BaselineResumeV2BackfillService],
  exports: [StudioArtifactsService],
})
export class StudioArtifactsModule {}
