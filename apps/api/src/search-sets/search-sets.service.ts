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

@Injectable()
export class SearchSetsService {
  constructor(
    @InjectRepository(SearchSet)
    private readonly searchSetRepository: Repository<SearchSet>,
  ) {}

  private sanitizeList(values?: string[]) {
    return values?.map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
  }

  async createSearchSet(userId: string, dto: CreateSearchSetDto) {
    const searchSet = this.searchSetRepository.create({
      userId,
      titlePatterns: this.sanitizeList(dto.titlePatterns),
      seniority: dto.seniority ?? SearchSetSeniority.ANY,
      industry: this.sanitizeList(dto.industry),
      workMode: dto.workMode ?? SearchSetWorkMode.ANY,
      sourceUrl: dto.sourceUrl?.trim() || null,
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

    if (dto.titlePatterns !== undefined) {
      searchSet.titlePatterns = this.sanitizeList(dto.titlePatterns);
    }
    if (dto.seniority !== undefined) {
      searchSet.seniority = dto.seniority;
    }
    if (dto.industry !== undefined) {
      searchSet.industry = this.sanitizeList(dto.industry);
    }
    if (dto.workMode !== undefined) {
      searchSet.workMode = dto.workMode;
    }
    if (dto.sourceUrl !== undefined) {
      searchSet.sourceUrl = dto.sourceUrl?.trim() || null;
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
