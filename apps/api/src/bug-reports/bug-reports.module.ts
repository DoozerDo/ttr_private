import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { BugReport } from './bug-report.entity';
import { BugReportsController } from './bug-reports.controller';
import { BugReportStorageService } from './bug-report-storage.service';
import { BugReportsService } from './bug-reports.service';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([BugReport]),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        storage: memoryStorage(),
        limits: {
          fileSize: MAX_SCREENSHOT_BYTES,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [BugReportsController],
  providers: [BugReportsService, BugReportStorageService],
  exports: [BugReportsService],
})
export class BugReportsModule {}
