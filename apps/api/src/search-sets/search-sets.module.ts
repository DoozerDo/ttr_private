import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { FitScoringService } from '../analysis/fit-scoring.service';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job } from '../jobs/job.entity';
import { SearchSet } from './search-set.entity';
import { SearchSetsController } from './search-sets.controller';
import { SearchSetsRunnerService } from './search-sets-runner.service';
import { SearchSetsService } from './search-sets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SearchSet,
      Job,
      FitAssessment,
      Baseline,
      BaselineVersion,
      BaselineBlockPolicy,
    ]),
  ],
  controllers: [SearchSetsController],
  providers: [
    SearchSetsService,
    SearchSetsRunnerService,
    FitScoringService,
  ],
})
export class SearchSetsModule {}
