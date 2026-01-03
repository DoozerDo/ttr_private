import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSearchSetDto } from './dto/create-search-set.dto';
import { UpdateSearchSetDto } from './dto/update-search-set.dto';
import {
  SearchSet,
  SearchSetSeniority,
  SearchSetWorkMode,
} from './search-set.entity';

type ParsedSearchSetFromUrl = {
  sourceUrl: string | null;
  urlBacked: boolean;
  parseWarning: string | null;
  titlePatterns?: string[];
  seniority?: SearchSetSeniority;
  workMode?: SearchSetWorkMode;
};

@Injectable()
export class SearchSetsService {
  constructor(
    @InjectRepository(SearchSet)
    private readonly searchSetRepository: Repository<SearchSet>,
  ) {}

  private sanitizeList(values?: string[] | null) {
    return (
      values
        ?.map((value) => value.trim())
        .filter((value) => value.length > 0)
        .filter((value, index, arr) => arr.indexOf(value) === index) ?? []
    );
  }

  private detectWorkMode(url: URL): SearchSetWorkMode | null {
    const workTypeParam =
      url.searchParams.get('f_WT') ||
      url.searchParams.get('workplaceType') ||
      url.searchParams.get('remoteWorkplaceType');

    const workTypeMap: Record<string, SearchSetWorkMode> = {
      '1': SearchSetWorkMode.ONSITE,
      '2': SearchSetWorkMode.REMOTE,
      '3': SearchSetWorkMode.HYBRID,
      onsite: SearchSetWorkMode.ONSITE,
      remote: SearchSetWorkMode.REMOTE,
      hybrid: SearchSetWorkMode.HYBRID,
    };

    if (workTypeParam) {
      for (const token of workTypeParam.split(',').map((v) => v.trim())) {
        const mapped = workTypeMap[token.toLowerCase()];
        if (mapped) {
          return mapped;
        }
      }
    }

    const haystack = `${url.searchParams.toString()} ${url.pathname}`.toLowerCase();
    if (haystack.includes('remote')) return SearchSetWorkMode.REMOTE;
    if (haystack.includes('hybrid')) return SearchSetWorkMode.HYBRID;
    if (haystack.includes('onsite') || haystack.includes('on-site')) {
      return SearchSetWorkMode.ONSITE;
    }

    return null;
  }

  private detectSeniority(url: URL): SearchSetSeniority | null {
    const experienceParam =
      url.searchParams.get('f_E') ||
      url.searchParams.get('experience') ||
      url.searchParams.get('level');

    const experienceMap: Record<string, SearchSetSeniority> = {
      '1': SearchSetSeniority.ENTRY,
      '2': SearchSetSeniority.ENTRY,
      '3': SearchSetSeniority.MID,
      '4': SearchSetSeniority.SENIOR,
      '5': SearchSetSeniority.LEAD,
      '6': SearchSetSeniority.EXECUTIVE,
      entry: SearchSetSeniority.ENTRY,
      junior: SearchSetSeniority.ENTRY,
      associate: SearchSetSeniority.MID,
      mid: SearchSetSeniority.MID,
      senior: SearchSetSeniority.SENIOR,
      lead: SearchSetSeniority.LEAD,
      director: SearchSetSeniority.EXECUTIVE,
      executive: SearchSetSeniority.EXECUTIVE,
      vp: SearchSetSeniority.EXECUTIVE,
    };

    if (experienceParam) {
      for (const token of experienceParam.split(',').map((v) => v.trim())) {
        const mapped = experienceMap[token.toLowerCase()];
        if (mapped) {
          return mapped;
        }
      }
    }

    const haystack = decodeURIComponent(url.search).toLowerCase();
    for (const [key, value] of Object.entries(experienceMap)) {
      if (haystack.includes(key)) {
        return value;
      }
    }

    return null;
  }

  private detectTitlePatterns(url: URL) {
    const candidates = ['keywords', 'keyword', 'title', 'q', 'query', 'position'];
    const patterns: string[] = [];

    for (const key of candidates) {
      const value = url.searchParams.get(key);
      if (value) {
        patterns.push(...value.split(/[,|]/));
      }
    }

    return this.sanitizeList(patterns);
  }

  private parseJobBoardUrl(rawUrl?: string | null): ParsedSearchSetFromUrl | null {
    const cleaned = rawUrl?.trim();
    if (!cleaned) return null;

    const baseResult: ParsedSearchSetFromUrl = {
      sourceUrl: cleaned,
      urlBacked: true,
      parseWarning: null,
    };

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleaned);
    } catch {
      return {
        ...baseResult,
        parseWarning: 'Stored URL but could not parse its parameters.',
      };
    }

    const titlePatterns = this.detectTitlePatterns(parsedUrl);
    const seniority = this.detectSeniority(parsedUrl);
    const workMode = this.detectWorkMode(parsedUrl);

    const parsedFields: string[] = [];
    const missingFields: string[] = [];

    if (titlePatterns.length > 0) {
      parsedFields.push('titles');
    } else {
      missingFields.push('titles');
    }

    if (seniority) {
      parsedFields.push('seniority');
    } else {
      missingFields.push('seniority');
    }

    if (workMode) {
      parsedFields.push('work mode');
    } else {
      missingFields.push('work mode');
    }

    let parseWarning: string | null = null;
    if (missingFields.length === 3) {
      parseWarning = 'Stored URL but did not recognize keywords or filters.';
    } else if (missingFields.length > 0) {
      parseWarning = `Parsed ${parsedFields.join(', ')}; missing ${missingFields.join(
        ', ',
      )} from URL.`;
    }

    return {
      ...baseResult,
      sourceUrl: parsedUrl.toString(),
      titlePatterns,
      seniority: seniority ?? undefined,
      workMode: workMode ?? undefined,
      parseWarning,
    };
  }

  private normalizeSourceUrl(
    parsedFromUrl: ParsedSearchSetFromUrl | null,
    dtoSourceUrl?: string | null,
  ): string | null {
    const candidate = parsedFromUrl?.sourceUrl ?? dtoSourceUrl?.trim();
    if (!candidate) return null;
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async createSearchSet(userId: string, dto: CreateSearchSetDto) {
    const parsedFromUrl = this.parseJobBoardUrl(dto.sourceUrl);
    const sourceUrl = this.normalizeSourceUrl(parsedFromUrl, dto.sourceUrl);

    const searchSet = this.searchSetRepository.create({
      userId,
      titlePatterns: this.sanitizeList(
        dto.titlePatterns ?? parsedFromUrl?.titlePatterns,
      ),
      seniority:
        dto.seniority ?? parsedFromUrl?.seniority ?? SearchSetSeniority.ANY,
      industry: this.sanitizeList(dto.industry),
      workMode: dto.workMode ?? parsedFromUrl?.workMode ?? SearchSetWorkMode.ANY,
      sourceUrl,
      urlBacked: parsedFromUrl?.urlBacked ?? false,
      parseWarning: parsedFromUrl?.parseWarning ?? null,
      isActive: dto.isActive ?? true,
    });

    return this.searchSetRepository.save(searchSet);
  }

  async listSearchSetsForUser(userId: string) {
    return this.searchSetRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getSearchSetForUser(id: string, userId: string) {
    const searchSet = await this.searchSetRepository.findOne({
      where: { id, userId },
    });

    if (!searchSet) {
      throw new NotFoundException('Search set not found');
    }

    return searchSet;
  }

  async updateSearchSet(id: string, userId: string, dto: UpdateSearchSetDto) {
    const searchSet = await this.getSearchSetForUser(id, userId);
    const parsedFromUrl =
      dto.sourceUrl !== undefined ? this.parseJobBoardUrl(dto.sourceUrl) : null;

    if (dto.titlePatterns !== undefined) {
      searchSet.titlePatterns = this.sanitizeList(dto.titlePatterns);
    } else if (parsedFromUrl?.titlePatterns?.length) {
      searchSet.titlePatterns = this.sanitizeList(parsedFromUrl.titlePatterns);
    }

    if (dto.seniority !== undefined) {
      searchSet.seniority = dto.seniority;
    } else if (parsedFromUrl?.seniority !== undefined) {
      searchSet.seniority = parsedFromUrl.seniority;
    }

    if (dto.industry !== undefined) {
      searchSet.industry = this.sanitizeList(dto.industry);
    }

    if (dto.workMode !== undefined) {
      searchSet.workMode = dto.workMode;
    } else if (parsedFromUrl?.workMode !== undefined) {
      searchSet.workMode = parsedFromUrl.workMode;
    }

    if (dto.sourceUrl !== undefined) {
      searchSet.sourceUrl = this.normalizeSourceUrl(parsedFromUrl, dto.sourceUrl);
      searchSet.urlBacked = parsedFromUrl?.urlBacked ?? false;
      searchSet.parseWarning = parsedFromUrl?.parseWarning ?? null;
    }

    if (dto.isActive !== undefined) {
      searchSet.isActive = dto.isActive;
    }

    return this.searchSetRepository.save(searchSet);
  }

  async deleteSearchSet(id: string, userId: string) {
    const searchSet = await this.getSearchSetForUser(id, userId);

    await this.searchSetRepository.remove(searchSet);

    return { deleted: true, id };
  }
}
