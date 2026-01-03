import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateStarStoryDto } from './dto/create-star-story.dto';
import { UpdateStarStoryDto } from './dto/update-star-story.dto';
import { StarStory } from './star-story.entity';

@Injectable()
export class StarStoriesService {
  constructor(
    @InjectRepository(StarStory)
    private readonly starStoryRepository: Repository<StarStory>,
  ) {}

  private sanitizeString(value?: string | null) {
    if (value === undefined) return value;
    const trimmed = value?.trim() ?? '';
    return trimmed.length ? trimmed : null;
  }

  private sanitizeStringArray(values?: string[]) {
    return (values ?? []).map((value) => value.trim()).filter(Boolean);
  }

  private validateRequiredFields(dto: CreateStarStoryDto | UpdateStarStoryDto) {
    const required = ['title', 'situation', 'task', 'action', 'result'] as const;

    for (const field of required) {
      const value = (dto as Record<string, unknown>)[field];
      if (value !== undefined && typeof value === 'string' && !value.trim()) {
        throw new BadRequestException(`${field} is required.`);
      }
    }
  }

  async createStarStory(userId: string, dto: CreateStarStoryDto) {
    this.validateRequiredFields(dto);

    if (!dto.title?.trim()) {
      throw new BadRequestException('title is required.');
    }
    if (!dto.situation?.trim()) {
      throw new BadRequestException('situation is required.');
    }
    if (!dto.task?.trim()) {
      throw new BadRequestException('task is required.');
    }
    if (!dto.action?.trim()) {
      throw new BadRequestException('action is required.');
    }
    if (!dto.result?.trim()) {
      throw new BadRequestException('result is required.');
    }

    const story = this.starStoryRepository.create({
      userId,
      title: dto.title.trim(),
      situation: dto.situation.trim(),
      task: dto.task.trim(),
      action: dto.action.trim(),
      result: dto.result.trim(),
      reflections: this.sanitizeString(dto.reflections) ?? null,
      competencies: this.sanitizeStringArray(dto.competencies),
    });

    return this.starStoryRepository.save(story);
  }

  async listStarStoriesForUser(userId: string) {
    return this.starStoryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getStarStoryForUser(id: string, userId: string) {
    const story = await this.starStoryRepository.findOne({ where: { id, userId } });

    if (!story) {
      throw new NotFoundException('STAR story not found');
    }

    return story;
  }

  async updateStarStory(id: string, userId: string, dto: UpdateStarStoryDto) {
    const story = await this.getStarStoryForUser(id, userId);

    this.validateRequiredFields(dto);

    if (dto.title !== undefined) story.title = dto.title.trim();
    if (dto.situation !== undefined) story.situation = dto.situation.trim();
    if (dto.task !== undefined) story.task = dto.task.trim();
    if (dto.action !== undefined) story.action = dto.action.trim();
    if (dto.result !== undefined) story.result = dto.result.trim();
    if (dto.reflections !== undefined) {
      story.reflections = this.sanitizeString(dto.reflections) ?? null;
    }
    if (dto.competencies !== undefined) {
      story.competencies = this.sanitizeStringArray(dto.competencies);
    }

    return this.starStoryRepository.save(story);
  }

  async deleteStarStory(id: string, userId: string) {
    const story = await this.getStarStoryForUser(id, userId);

    await this.starStoryRepository.remove(story);

    return { deleted: true, id };
  }
}
