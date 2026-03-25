import { ForbiddenException } from '@nestjs/common';
import { BugReportSeverity, BugReportStatus } from './bug-report.entity';
import { BugReportsController } from './bug-reports.controller';

describe('BugReportsController', () => {
  const service = {
    createReport: jest.fn(),
    listReports: jest.fn(),
    getReportById: jest.fn(),
    updateReport: jest.fn(),
    getScreenshotAbsolutePath: jest.fn(),
  } as any;

  const controller = new BugReportsController(service);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('allows authenticated users to create reports', async () => {
    service.createReport.mockResolvedValue({
      id: 'bug-1',
      status: BugReportStatus.OPEN,
      severity: BugReportSeverity.NEW,
      createdAt: '2026-03-25T00:00:00.000Z',
    });

    const result = await controller.create(
      { whatHappened: 'Something broke', route: '/results' } as any,
      { user: { id: 'user-1', role: 'user', email: 'u@example.com' } } as any,
      undefined,
    );

    expect(result.ok).toBe(true);
    expect(result.reportId).toBe('bug-1');
  });

  it('normalizes runtimeContext and viewport when multipart sends JSON strings', async () => {
    service.createReport.mockResolvedValue({
      id: 'bug-1',
      status: BugReportStatus.OPEN,
      severity: BugReportSeverity.NEW,
      createdAt: '2026-03-25T00:00:00.000Z',
    });

    await controller.create(
      {
        whatHappened: 'Something broke',
        route: '/results',
        runtimeContext: '{"source":"multipart"}',
        viewport: '{"width":1200,"height":800}',
      } as any,
      { user: { id: 'user-1', role: 'user', email: 'u@example.com' } } as any,
      undefined,
    );

    expect(service.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: { source: 'multipart' },
        viewport: { width: 1200, height: 800 },
      }),
      expect.objectContaining({ id: 'user-1' }),
      undefined,
    );
  });

  it('does not throw on invalid JSON multipart fields and falls back safely', async () => {
    service.createReport.mockResolvedValue({
      id: 'bug-1',
      status: BugReportStatus.OPEN,
      severity: BugReportSeverity.NEW,
      createdAt: '2026-03-25T00:00:00.000Z',
    });

    const result = await controller.create(
      {
        whatHappened: 'Something broke',
        route: '/results',
        runtimeContext: '{invalid',
        viewport: '{invalid',
      } as any,
      { user: { id: 'user-1', role: 'user', email: 'u@example.com' } } as any,
      undefined,
    );

    expect(result.ok).toBe(true);
    expect(service.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: {},
        viewport: undefined,
      }),
      expect.objectContaining({ id: 'user-1' }),
      undefined,
    );
  });

  it('defaults missing route from referer pathname for multipart submissions', async () => {
    service.createReport.mockResolvedValue({
      id: 'bug-1',
      status: BugReportStatus.OPEN,
      severity: BugReportSeverity.NEW,
      createdAt: '2026-03-25T00:00:00.000Z',
    });

    const result = await controller.create(
      {
        whatHappened: 'No route provided',
      } as any,
      {
        user: { id: 'user-1', role: 'user', email: 'u@example.com' },
        headers: { referer: 'https://app.targetthisrole.ai/results?job=1' },
      } as any,
      undefined,
    );

    expect(result.ok).toBe(true);
    expect(service.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/results?job=1',
      }),
      expect.objectContaining({ id: 'user-1' }),
      undefined,
    );
  });

  it('blocks list for non-admin users', async () => {
    await expect(
      controller.list(
        { user: { id: 'user-1', role: 'user' } } as any,
        {} as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin list', async () => {
    service.listReports.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, pageCount: 0 });
    const result = await controller.list(
      { user: { id: 'admin-1', role: 'admin' } } as any,
      { page: 1, pageSize: 25 } as any,
    );
    expect(result.items).toEqual([]);
  });
});
