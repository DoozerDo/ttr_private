import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CreateStarStoryDto } from './dto/create-star-story.dto';
import { UpdateStarStoryDto } from './dto/update-star-story.dto';
import { StarStoriesService } from './star-stories.service';

@Controller('star-stories')
@UseGuards(AuthGuard('jwt'))
export class StarStoriesController {
  constructor(private readonly starStoriesService: StarStoriesService) {}

  @Post()
  async createStarStory(
    @Body() body: CreateStarStoryDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.starStoriesService.createStarStory(userId, body);
  }

  @Get()
  async listStarStories(@Req() request: Request & { user?: { id?: string } }) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.starStoriesService.listStarStoriesForUser(userId);
  }

  @Get(':id')
  async getStarStory(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.starStoriesService.getStarStoryForUser(id, userId);
  }

  @Patch(':id')
  async updateStarStory(
    @Param('id') id: string,
    @Body() body: UpdateStarStoryDto,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.starStoriesService.updateStarStory(id, userId, body);
  }

  @Delete(':id')
  async deleteStarStory(
    @Param('id') id: string,
    @Req() request: Request & { user?: { id?: string } },
  ) {
    const userId = request.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.starStoriesService.deleteStarStory(id, userId);
  }
}
