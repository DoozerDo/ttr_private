import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { BugReport, BugReportSeverity, BugReportStatus } from './bug-report.entity';
import { BugReportStorageService } from './bug-report-storage.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { ListBugReportsDto } from './dto/list-bug-reports.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';

@Injectable()
export class BugReportsService {
  private readonly logger = new Logger(BugReportsService.name);

  constructor(
    @InjectRepository(BugReport)
    private readonly bugReportRepo: Repository<BugReport>,
    private readonly bugReportStorageService: BugReportStorageService,
  ) {}

  async createReport(
    payload: CreateBugReportDto,
    user: AuthUserDto,
    screenshot?: Express.Multer.File,
  ) {
    const runtimeContext = this.parseRuntimeContext(payload.runtimeContext);
    const viewport = this.parseViewport(payload.viewport, runtimeContext);

    try {
      const screenshotMetadata = screenshot
        ? await this.persistScreenshot(screenshot)
        : null;

      const entity = this.bugReportRepo.create({
        userId: this.normalizeUuid(user.id),
        reporterEmail: this.normalizeEmail(payload.reporterEmail, user.email),
        whatHappened: payload.whatHappened.trim(),
        attemptedAction: this.asNullableTrimmed(payload.attemptedAction),
        expectedBehavior: this.asNullableTrimmed(payload.expectedBehavior),
        route: this.normalizeRoute(payload.route, runtimeContext),
        pageLabel: this.asNullableTrimmed(payload.pageLabel),
        appVersion: this.asNullableTrimmed(payload.appVersion),
        gitSha: this.asNullableTrimmed(payload.gitSha),
        baselineId: this.normalizeUuid(payload.baselineId),
        assessmentId: this.normalizeUuid(payload.assessmentId),
        fitScore: this.normalizeFitScore(payload.fitScore),
        browserInfo: this.asNullableTrimmed(payload.browserInfo),
        viewport,
        runtimeContext,
        screenshotStoragePath: screenshotMetadata?.storagePath ?? null,
        screenshotOriginalFilename: screenshotMetadata?.originalFilename ?? null,
        screenshotMimeType: screenshotMetadata?.mimeType ?? null,
        screenshotSizeBytes: screenshotMetadata?.sizeBytes ?? null,
      });

      const saved = await this.bugReportRepo.save(entity);

      return {
        id: saved.id,
        status: saved.status,
        severity: saved.severity,
        createdAt: saved.createdAt,
      };
    } catch (error) {
      this.logger.error(
        'Bug report persistence failed',
        error instanceof Error ? error.stack : undefined,
        JSON.stringify({
          userId: user.id ?? null,
          hasScreenshot: Boolean(screenshot),
          route: this.normalizeRoute(payload.route, runtimeContext),
          baselineId: this.normalizeUuid(payload.baselineId),
          assessmentId: this.normalizeUuid(payload.assessmentId),
          hasRuntimeContext: Boolean(runtimeContext && Object.keys(runtimeContext).length),
          hasViewport: Boolean(viewport),
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new InternalServerErrorException('Bug report failed to send');
    }
  }

  async listReports(filters: ListBugReportsDto) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
    const query = this.bugReportRepo
      .createQueryBuilder('bug')
      .leftJoinAndSelect('bug.user', 'user')
      .orderBy('bug.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (filters.status) {
      query.andWhere('bug.status = :status', { status: filters.status });
    }
    if (filters.severity) {
      query.andWhere('bug.severity = :severity', { severity: filters.severity });
    }
    if (filters.query?.trim()) {
      query.andWhere(
        '(bug.whatHappened ILIKE :q OR bug.route ILIKE :q OR user.email ILIKE :q)',
        { q: `%${filters.query.trim()}%` },
      );
    }

    const [items, total] = await query.getManyAndCount();
    return {
      items,
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async getReportById(id: string) {
    const report = await this.bugReportRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!report) {
      throw new NotFoundException('Bug report not found.');
    }
    return report;
  }

  async updateReport(id: string, payload: UpdateBugReportDto, actor: AuthUserDto) {
    const report = await this.getReportById(id);

    if (payload.status) {
      report.status = payload.status;
      if (payload.status === BugReportStatus.RESOLVED || payload.status === BugReportStatus.CLOSED) {
        report.resolvedAt = payload.resolvedAt ? new Date(payload.resolvedAt) : new Date();
        report.resolvedByUserId = payload.resolvedByUserId?.trim() || actor.id;
      }
      if (
        payload.status === BugReportStatus.OPEN ||
        payload.status === BugReportStatus.TRIAGED ||
        payload.status === BugReportStatus.IN_PROGRESS
      ) {
        report.resolvedAt = null;
        report.resolvedByUserId = null;
      }
    }

    if (payload.severity) {
      report.severity = payload.severity;
    }
    if (payload.triageNotes !== undefined) {
      report.triageNotes = payload.triageNotes?.trim() || null;
    }
    if (payload.resolvedAt !== undefined && !payload.status) {
      report.resolvedAt = payload.resolvedAt ? new Date(payload.resolvedAt) : null;
    }
    if (payload.resolvedByUserId !== undefined && !payload.status) {
      report.resolvedByUserId = payload.resolvedByUserId?.trim() || null;
    }

    return this.bugReportRepo.save(report);
  }

  getScreenshotAbsolutePath(storagePath: string): string {
    return this.bugReportStorageService.getAbsoluteScreenshotPath(storagePath);
  }

  private parseRuntimeContext(raw: CreateBugReportDto['runtimeContext']): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
    }
    return {};
  }

  private parseViewport(
    viewportInput: CreateBugReportDto['viewport'],
    runtimeContext: Record<string, unknown>,
  ) {
    if (viewportInput && typeof viewportInput === 'object') {
      return viewportInput;
    }
    if (typeof viewportInput === 'string') {
      try {
        const parsed = JSON.parse(viewportInput);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Multipart form-data may send malformed JSON; fallback without failing report submission.
      }
    }
    const viewport = runtimeContext.viewport;
    if (viewport && typeof viewport === 'object' && !Array.isArray(viewport)) {
      return viewport as Record<string, unknown>;
    }
    return null;
  }

  private normalizeFitScore(value?: string): string | null {
    if (!value) return null;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed.toFixed(2);
  }

  private asNullableTrimmed(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeRoute(routeValue: string | undefined, runtimeContext: Record<string, unknown>): string {
    const direct = this.asNullableTrimmed(routeValue);
    if (direct) return direct;

    const contextRoute = runtimeContext.route;
    if (typeof contextRoute === 'string' && contextRoute.trim().length > 0) {
      return contextRoute.trim();
    }

    const href = runtimeContext.href;
    if (typeof href === 'string' && href.trim().length > 0) {
      try {
        const parsed = new URL(href);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return href.trim();
      }
    }

    return '/unknown';
  }

  private normalizeEmail(reporterEmail?: string, userEmail?: string): string | null {
    const reporter = this.asNullableTrimmed(reporterEmail);
    if (reporter) return reporter;
    return this.asNullableTrimmed(userEmail);
  }

  private normalizeUuid(value?: string | null): string | null {
    const trimmed = this.asNullableTrimmed(value ?? undefined);
    if (!trimmed) return null;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(trimmed) ? trimmed : null;
  }

  private async persistScreenshot(file: Express.Multer.File) {
    return this.bugReportStorageService.persistScreenshot(file);
  }
}
