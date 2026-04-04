import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type StoredScreenshot = {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class BugReportStorageService {
  private readonly logger = new Logger(BugReportStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  getScreenshotStorageDirectory() {
    return (
      this.configService.get<string>('BUG_REPORT_SCREENSHOT_STORAGE_PATH') ??
      path.join(process.cwd(), 'storage', 'bug-reports', 'screenshots')
    );
  }

  async ensureScreenshotStorageDirectory() {
    const storageDir = this.getScreenshotStorageDirectory();
    await mkdir(storageDir, { recursive: true });
    return storageDir;
  }

  getAbsoluteScreenshotPath(storagePath: string) {
    const safeFileName = path.basename(storagePath);
    return path.join(this.getScreenshotStorageDirectory(), safeFileName);
  }

  async persistScreenshot(file: Express.Multer.File): Promise<StoredScreenshot> {
    const storageDir = await this.ensureScreenshotStorageDirectory();
    const extension = this.resolveExtension(file);
    const safeOriginal = path.basename(file.originalname || 'screenshot');
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    const absolutePath = path.join(storageDir, uniqueName);

    try {
      await writeFile(absolutePath, file.buffer);
      return {
        storagePath: uniqueName,
        originalFilename: safeOriginal,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      };
    } catch (error) {
      this.logger.error('Failed to persist bug report screenshot', {
        storageDir,
        fileName: uniqueName,
        mimeType: file.mimetype,
        size: file.size,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Failed to persist screenshot');
    }
  }

  private resolveExtension(file: Express.Multer.File): string {
    if (file.mimetype === 'image/png') return '.png';
    if (file.mimetype === 'image/webp') return '.webp';
    if (file.mimetype === 'image/jpeg') return '.jpg';
    return path.extname(file.originalname || '') || '.bin';
  }
}
