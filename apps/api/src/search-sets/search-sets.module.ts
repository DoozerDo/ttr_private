import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { FitScoringService } from '../analysis/fit-scoring.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job } from '../jobs/job.entity';
import { LlmRubricScorerService } from '../analysis/llm-rubric-scorer.service';
import { JobsModule } from '../jobs/jobs.module';
import { SearchSet } from './search-set.entity';
import { SearchSetRun } from './search-set-run.entity';
import { SearchSetRunsService } from './search-set-runs.service';
import { SearchSetsController } from './search-sets.controller';
import { SearchSetsRunnerService } from './search-sets-runner.service';
import { SearchSetsService } from './search-sets.service';
import { JobSourcesModule } from '../job-sources/job-source.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SearchSet,
      Job,
      FitAssessment,
      Baseline,
      BaselineVersion,
      BaselineBlockPolicy,
      SearchSetRun,
    ]),
    JobsModule,
    JobSourcesModule,
  ],
  controllers: [SearchSetsController],
  providers: [
    SearchSetsService,
    SearchSetsRunnerService,
    SearchSetRunsService,
    FitScoringService,
    LlmRubricScorerService,
  ],
})
export class SearchSetsModule {}
