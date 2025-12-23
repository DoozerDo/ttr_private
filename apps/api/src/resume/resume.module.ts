import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [TypeOrmModule.forFeature([Baseline, BaselineSection, BaselineVersion])],
  controllers: [ResumeController],
  providers: [ResumeService],
})
export class ResumeModule {}
