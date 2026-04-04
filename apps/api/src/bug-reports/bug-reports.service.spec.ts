import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { AuthUserDto } from '../auth/dto/auth-response.dto';
import { BugReportStorageService } from './bug-report-storage.service';
import { BugReportSeverity, BugReportStatus } from './bug-report.entity';
import { BugReportsService } from './bug-reports.service';
import { InternalServerErrorException } from '@nestjs/common';

type StoredReport = {
  id: string;
  userId: string | null;
  whatHappened: string;
  attemptedAction: string | null;
  expectedBehavior: string | null;
  route: string;
  status: BugReportStatus;
  severity: BugReportSeverity;
  triageNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  screenshotStoragePath?: string | null;
  screenshotOriginalFilename?: string | null;
  screenshotMimeType?: string | null;
  screenshotSizeBytes?: number | null;
  runtimeContext?: Record<string, unknown>;
  viewport?: Record<string, unknown> | null;
};

describe('BugReportsService', () => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
  } as AuthUserDto;

  function createRepository() {
    const store: StoredReport[] = [];
    let lastSavedPayload: Partial<StoredReport> | null = null;
    const repo = {
      create: jest.fn((payload: Partial<StoredReport>) => payload),
      save: jest.fn(async (payload: Partial<StoredReport>) => {
        lastSavedPayload = payload;
        const existing = payload.id ? store.find((item) => item.id === payload.id) : null;
        if (existing) {
          Object.assign(existing, payload, { updatedAt: new Date() });
          return existing;
        }
        const created: StoredReport = {
          id: `bug-${store.length + 1}`,
          userId: payload.userId ?? null,
          whatHappened: payload.whatHappened ?? '',
          attemptedAction: payload.attemptedAction ?? null,
          expectedBehavior: payload.expectedBehavior ?? null,
          route: payload.route ?? '/unknown',
          status: payload.status ?? BugReportStatus.OPEN,
          severity: payload.severity ?? BugReportSeverity.NEW,
          triageNotes: payload.triageNotes ?? null,
          screenshotStoragePath: payload.screenshotStoragePath ?? null,
          screenshotOriginalFilename: payload.screenshotOriginalFilename ?? null,
          screenshotMimeType: payload.screenshotMimeType ?? null,
          screenshotSizeBytes: payload.screenshotSizeBytes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.push(created);
        return created;
      }),
      createQueryBuilder: jest.fn(() => {
        const chain = {
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getManyAndCount: jest.fn(async () => [store, store.length]),
        };
        return chain;
      }),
      findOne: jest.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const match = store.find((item) => item.id === id);
        return (match ? { ...match } : null) as any;
      }),
    };
    return {
      repo: repo as unknown as Repository<any>,
      store,
      getLastSavedPayload: () => lastSavedPayload,
    };
  }

  async function buildService(storagePath: string) {
    const { repo, getLastSavedPayload } = createRepository();
    const configService = {
      get(key: string) {
        if (key === 'BUG_REPORT_SCREENSHOT_STORAGE_PATH') return storagePath;
        return undefined;
      },
    } as ConfigService;
    const storageService = new BugReportStorageService(configService);
    const service = new BugReportsService(repo, storageService);
    return { service, getLastSavedPayload };
  }

  it('create bug report without screenshot succeeds', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'ttr-bug-report-noshot-'));
    const storagePath = path.join(tempRoot, 'screenshots');
    const { service } = await buildService(storagePath);

    const created = await service.createReport(
      {
        whatHappened: 'Results page did not load',
        route: '/results',
      },
      user,
    );

    expect(created.id).toBe('bug-1');
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('create bug report with required text and auto route succeeds', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'ttr-bug-report-route-fallback-'));
    const storagePath = path.join(tempRoot, 'screenshots');
    const { service, getLastSavedPayload } = await buildService(storagePath);

    const created = await service.createReport(
      {
        whatHappened: 'Missing route should fallback',
        runtimeContext: { route: '/from-runtime-context' },
      },
      user,
    );

    expect(created.id).toBe('bug-1');
    expect(getLastSavedPayload()?.route).toBe('/from-runtime-context');

    await rm(tempRoot, { recursive: true, force: true });
  });

  it('creates missing storage directory and persists screenshot + metadata', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'ttr-bug-report-shot-'));
    const storagePath = path.join(tempRoot, 'missing', 'screenshots');
    const { service, getLastSavedPayload } = await buildService(storagePath);

    const created = await service.createReport(
      {
        whatHappened: 'Screenshot upload path test',
        route: '/baseline',
      },
      user,
      {
        originalname: 'shot.png',
        mimetype: 'image/png',
        size: 3,
        buffer: Buffer.from('abc'),
      } as Express.Multer.File,
    );

    expect(created.id).toBe('bug-1');

    const dirStats = await stat(storagePath);
    expect(dirStats.isDirectory()).toBe(true);

    const files = await readdir(storagePath);
    expect(files.length).toBe(1);
    const fileContents = await readFile(path.join(storagePath, files[0]));
    expect(fileContents.toString()).toBe('abc');

    const savedPayload = getLastSavedPayload();
    expect(savedPayload?.screenshotStoragePath).toBeTruthy();
    expect(savedPayload?.screenshotOriginalFilename).toBe('shot.png');
    expect(savedPayload?.screenshotMimeType).toBe('image/png');
    expect(savedPayload?.screenshotSizeBytes).toBe(3);

    await rm(tempRoot, { recursive: true, force: true });
  });

  it('accepts runtimeContext as JSON string and persists object payload', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'ttr-bug-report-runtime-json-'));
    const storagePath = path.join(tempRoot, 'screenshots');
    const { service, getLastSavedPayload } = await buildService(storagePath);

    const created = await service.createReport(
      {
        whatHappened: 'Runtime context string payload',
        route: '/results',
        runtimeContext: '{"key":"value"}',
      },
      user,
    );

    expect(created.id).toBe('bug-1');
    expect(getLastSavedPayload()?.runtimeContext).toEqual({ key: 'value' });

    await rm(tempRoot, { recursive: true, force: true });
  });

  it('does not crash on invalid runtimeContext JSON and falls back to empty object', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'ttr-bug-report-runtime-invalid-'));
    const storagePath = path.join(tempRoot, 'screenshots');
    const { service, getLastSavedPayload } = await buildService(storagePath);

    const created = await service.createReport(
      {
        whatHappened: 'Invalid runtime context JSON',
        route: '/results',
        runtimeContext: '{invalid-json',
      },
      user,
    );

    expect(created.id).toBe('bug-1');
    expect(getLastSavedPayload()?.runtimeContext).toEqual({});

    await rm(tempRoot, { recursive: true, force: true });
  });

  it('keeps optional nullable fields as null', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'ttr-bug-report-nullables-'));
    const storagePath = path.join(tempRoot, 'screenshots');
    const { service, getLastSavedPayload } = await buildService(storagePath);

    const created = await service.createReport(
      {
        whatHappened: 'Nullables should remain null',
        route: '/results',
        attemptedAction: '',
        expectedBehavior: '',
        reporterEmail: '',
        baselineId: 'not-a-uuid',
        assessmentId: 'not-a-uuid',
      },
      user,
    );

    expect(created.id).toBe('bug-1');
    const payload = getLastSavedPayload();
    expect(payload?.attemptedAction).toBeNull();
    expect(payload?.expectedBehavior).toBeNull();
    expect(payload?.baselineId).toBeNull();
    expect(payload?.assessmentId).toBeNull();

    await rm(tempRoot, { recursive: true, force: true });
  });

  it('logs and returns controlled error when repository save fails', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'ttr-bug-report-save-fail-'));
    const storagePath = path.join(tempRoot, 'screenshots');
    const { repo } = createRepository();
    const configService = {
      get(key: string) {
        if (key === 'BUG_REPORT_SCREENSHOT_STORAGE_PATH') return storagePath;
        return undefined;
      },
    } as ConfigService;
    const storageService = new BugReportStorageService(configService);
    const service = new BugReportsService(repo, storageService);
    const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    (repo.save as jest.Mock).mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      service.createReport(
        { whatHappened: 'Should fail', route: '/results' },
        user,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(loggerSpy).toHaveBeenCalled();

    loggerSpy.mockRestore();
    await rm(tempRoot, { recursive: true, force: true });
  });
});
