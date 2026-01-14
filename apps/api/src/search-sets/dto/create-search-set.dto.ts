import {
  SearchSetSeniority,
  SearchSetWorkMode,
  SearchSetSourceType,
} from '../search-set.entity';

export class CreateSearchSetDto {
  titlePatterns?: string[];
  seniority?: SearchSetSeniority[];
  industry?: string[];
  workMode?: SearchSetWorkMode[];
  location?: string | null;
  sourceType?: SearchSetSourceType | null;
  sourceUrl?: string | null;
  sourceOptions?: Record<string, unknown> | null;
  isActive?: boolean;
}
