import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceModule } from '../compliance/compliance.module';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { ApplicationsModule } from '../applications/applications.module';
import { CoverLetter } from './cover-letter.entity';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';
import { WorkflowIdempotencyModule } from '../common/workflow-idempotency.module';
import { StudioArtifactsModule } from '../studio-artifacts/studio-artifacts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CoverLetter]),
    ComplianceModule,
    ApplicationsModule,
    WorkflowIdempotencyModule,
    StudioArtifactsModule,
  ],
  controllers: [CoverLettersController],
  providers: [CoverLettersService, GapAnalysisService],
  exports: [CoverLettersService],
})
export class CoverLettersModule {}
