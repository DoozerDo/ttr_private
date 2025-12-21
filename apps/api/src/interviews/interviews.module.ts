import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewResponse } from './interview-response.entity';
import { InterviewSession } from './interview-session.entity';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([InterviewSession, InterviewResponse])],
  controllers: [InterviewsController],
  providers: [InterviewsService],
})
export class InterviewsModule {}
