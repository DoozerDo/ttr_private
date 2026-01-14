import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SearchSetRun,
  SearchSetRunResultSummary,
  SearchSetRunSourceSnapshot,
} from './search-set-run.entity';

export type SearchSetRunRecordInput = {
  runId: string;
  searchSetId: string;
  baselineVersionId: string;
  sourceSnapshot: SearchSetRunSourceSnapshot | null;
  runInputHash: string | null;
  usedProviderDiscovery: boolean;
  failureCount: number;
  topResults: SearchSetRunResultSummary[];
};

@Injectable()
export class SearchSetRunsService {
  constructor(
    @InjectRepository(SearchSetRun)
    private readonly repository: Repository<SearchSetRun>,
  ) {}

  async recordRun(input: SearchSetRunRecordInput) {
    const entry = this.repository.create({
      id: input.runId,
      searchSetId: input.searchSetId,
      baselineVersionId: input.baselineVersionId,
      sourceSnapshot: input.sourceSnapshot,
      runInputHash: input.runInputHash,
      failureCount: input.failureCount,
      topResults: input.topResults.length ? input.topResults : null,
      usedProviderDiscovery: input.usedProviderDiscovery,
    });

    return this.repository.save(entry);
  }
}
