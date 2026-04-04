import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BetaFeedbackController } from './beta-feedback.controller';
import { BetaFeedback } from './beta-feedback.entity';
import { BetaFeedbackService } from './beta-feedback.service';

@Module({
  imports: [TypeOrmModule.forFeature([BetaFeedback])],
  controllers: [BetaFeedbackController],
  providers: [BetaFeedbackService],
  exports: [BetaFeedbackService],
})
export class BetaFeedbackModule {}

