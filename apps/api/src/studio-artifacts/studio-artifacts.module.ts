import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { StudioArtifact } from './studio-artifact.entity';
import { StudioArtifactsController } from './studio-artifacts.controller';
import { StudioArtifactsService } from './studio-artifacts.service';

@Module({
  imports: [TypeOrmModule.forFeature([StudioArtifact, BaselineVersion, FitAssessment, Job])],
  controllers: [StudioArtifactsController],
  providers: [StudioArtifactsService],
  exports: [StudioArtifactsService],
})
export class StudioArtifactsModule {}
