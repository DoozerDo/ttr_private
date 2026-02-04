import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { diskStorage } from 'multer';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BaselineSection } from './baseline-section.entity';
import { BaselineController } from './baseline.controller';
import { Baseline } from './baseline.entity';
import { BaselineParsed } from './baseline-parsed.entity';
import { BaselineVersion } from './baseline-version.entity';
import { BaselineService } from './baseline.service';
import { BaselineBlockPolicy } from './baseline-block-policy.entity';
import { BaselineVersionService } from './baseline-version.service';
import { BaselineIngestionService } from './baseline-ingestion.service';
import { Interview } from '../interviews/interview.entity';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [
    ConfigModule,
    ComplianceModule,
    TypeOrmModule.forFeature([
      Baseline,
      BaselineSection,
      BaselineVersion,
      BaselineParsed,
      BaselineBlockPolicy,
      Interview,
    ]),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const uploadDir =
              configService.get<string>('BASELINE_STORAGE_PATH') ??
              path.join(process.cwd(), 'storage', 'baselines');

            mkdirSync(uploadDir, { recursive: true });
            cb(null, uploadDir);
          },
          filename: (_req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const ext = path.extname(file.originalname) || '.bin';
            cb(null, `${uniqueSuffix}${ext}`);
          },
        }),
        fileFilter: (_req, file, cb) => {
          const allowedMimes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ];

          if (!allowedMimes.includes(file.mimetype)) {
            return cb(
              new Error(
                'Only PDF and DOCX uploads are supported for baselines',
              ),
              false,
            );
          }

          cb(null, true);
        },
      }),
    }),
  ],
  providers: [
    BaselineService,
    BaselineVersionService,
    BaselineIngestionService,
  ],
  controllers: [BaselineController],
})
export class BaselineModule {}
