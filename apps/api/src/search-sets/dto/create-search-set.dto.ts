import { SearchSetSeniority, SearchSetWorkMode } from '../search-set.entity';

export class CreateSearchSetDto {
  titlePatterns?: string[];
  seniority?: SearchSetSeniority;
  industry?: string[];
  workMode?: SearchSetWorkMode;
  sourceUrl?: string | null;
  isActive?: boolean;
}
