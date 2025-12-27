import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { SearchSet } from './search-set.entity';
import { SearchSetsController } from './search-sets.controller';
import { SearchSetsRunnerService } from './search-sets-runner.service';
import { SearchSetsService } from './search-sets.service';

@Module({
  imports: [TypeOrmModule.forFeature([SearchSet, Job, FitAssessment])],
  controllers: [SearchSetsController],
  providers: [SearchSetsService, SearchSetsRunnerService],
})
export class SearchSetsModule {}
