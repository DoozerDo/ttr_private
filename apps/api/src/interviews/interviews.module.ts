import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Interview } from './interview.entity';
import { InterviewRecordsController } from './interview-records.controller';
import { InterviewRecordsService } from './interview-records.service';
import { InterviewResponse } from './interview-response.entity';
import { InterviewSession } from './interview-session.entity';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([InterviewSession, InterviewResponse, Interview])],
  controllers: [InterviewsController, InterviewRecordsController],
  providers: [InterviewsService, InterviewRecordsService],
  exports: [InterviewsService, InterviewRecordsService],
})
export class InterviewsModule {}
