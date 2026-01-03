import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StarStoriesController } from './star-stories.controller';
import { StarStoriesService } from './star-stories.service';
import { StarStory } from './star-story.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StarStory])],
  controllers: [StarStoriesController],
  providers: [StarStoriesService],
  exports: [StarStoriesService],
})
export class StarStoriesModule {}
