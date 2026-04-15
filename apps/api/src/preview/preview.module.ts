import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiModule } from '../ai/ai.module';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { BaselineTextExtractor } from '../baseline/baseline-text-extractor.service';
import { PreviewController } from './preview.controller';
import { PreviewService } from './preview.service';
import { PreviewCanonicalFitScoreService } from './preview-canonical-fit-score.service';

@Module({
  imports: [
    AiModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  ],
  controllers: [PreviewController],
  providers: [
    PreviewService,
    PreviewCanonicalFitScoreService,
    GapAnalysisService,
    BaselineTextExtractor,
  ],
})
export class PreviewModule {}
