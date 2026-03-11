import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PreviewController } from './preview.controller';
import { PreviewService } from './preview.service';

@Module({
  imports: [AiModule],
  controllers: [PreviewController],
  providers: [PreviewService],
})
export class PreviewModule {}
