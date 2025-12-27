import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoverLetter } from './cover-letter.entity';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';

@Module({
  imports: [TypeOrmModule.forFeature([CoverLetter])],
  controllers: [CoverLettersController],
  providers: [CoverLettersService],
})
export class CoverLettersModule {}
