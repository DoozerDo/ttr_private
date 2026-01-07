import { SearchSetSeniority, SearchSetWorkMode } from '../search-set.entity';

export class UpdateSearchSetDto {
  titlePatterns?: string[];
  seniority?: SearchSetSeniority[];
  industry?: string[];
  workMode?: SearchSetWorkMode[];
  location?: string | null;
  sourceUrl?: string | null;
  isActive?: boolean;
}
