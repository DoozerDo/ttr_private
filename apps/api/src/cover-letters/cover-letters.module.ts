import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceModule } from '../compliance/compliance.module';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { CoverLetter } from './cover-letter.entity';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';

@Module({
  imports: [TypeOrmModule.forFeature([CoverLetter]), ComplianceModule],
  controllers: [CoverLettersController],
  providers: [CoverLettersService, GapAnalysisService],
  exports: [CoverLettersService],
})
export class CoverLettersModule {}
