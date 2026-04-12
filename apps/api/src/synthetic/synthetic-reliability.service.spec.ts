import { SyntheticReliabilityService } from './synthetic-reliability.service';

describe('SyntheticReliabilityService', () => {
  const repo = {
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value) => value),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the registry entries with unknown status when no runs exist', async () => {
    repo.find.mockResolvedValue([]);
    const service = new SyntheticReliabilityService(repo);

    const report = await service.getReliabilityReport();

    expect(report.suiteCount).toBe(2);
    expect(report.suites).toHaveLength(2);
    expect(report.suites[0].suiteKey).toBe('landing-public-journeys');
    expect(report.suites[1].suiteKey).toBe('password-reset-public-journeys');
    expect(report.suites[0].latestRun?.status ?? 'unknown').toBe('unknown');
    expect(report.suites[0].recentHistory).toHaveLength(0);
    expect(report.statusCounts.unknown).toBe(2);
    expect(report.healthRollup.status).toBe('unknown');
    expect(report.healthRollup.recencyLabel).toBe('No run history yet');
  });

  it('normalizes database run rows into reliability status and history', async () => {
    repo.find.mockResolvedValue([
      {
        id: 'run-2',
        runType: 'synthetic_transaction',
        scenarioKey: 'landing-public-journeys',
        syntheticRunId: 'suite-run-2',
        status: 'failed',
        triggerSource: 'system',
        startedAt: new Date('2026-04-10T10:00:00.000Z'),
        finishedAt: new Date('2026-04-10T10:01:30.000Z'),
        durationMs: 90000,
        summaryJson: { summary: 'Login flow broke at the auth handoff', syntheticStatus: 'fail' },
        stepResultsJson: [{ step: 'login', status: 'failed' }],
        errorMessage: 'Auth redirect mismatch',
      },
      {
        id: 'run-1',
        runType: 'synthetic_transaction',
        scenarioKey: 'landing-public-journeys',
        syntheticRunId: 'suite-run-1',
        status: 'succeeded',
        triggerSource: 'system',
        startedAt: new Date('2026-04-09T10:00:00.000Z'),
        finishedAt: new Date('2026-04-09T10:01:00.000Z'),
        durationMs: 60000,
        summaryJson: { summary: 'Suite passed', syntheticStatus: 'pass' },
        stepResultsJson: [],
        errorMessage: null,
      },
      {
        id: 'run-3',
        runType: 'synthetic_transaction',
        scenarioKey: 'password-reset-public-journeys',
        syntheticRunId: 'suite-run-3',
        status: 'succeeded',
        triggerSource: 'system',
        startedAt: new Date('2026-04-10T11:00:00.000Z'),
        finishedAt: new Date('2026-04-10T11:02:00.000Z'),
        durationMs: 120000,
        summaryJson: {
          summary: 'Password reset synthetic passed',
          syntheticStatus: 'pass',
        },
        stepResultsJson: [],
        errorMessage: null,
      },
    ]);

    const service = new SyntheticReliabilityService(repo);
    const report = await service.getReliabilityReport(2);

    expect(report.suites[0].latestRun?.status).toBe('fail');
    expect(report.suites[0].latestRun?.summary).toBe('Login flow broke at the auth handoff');
    expect(report.suites[0].latestRun?.errorMessage).toBe('Auth redirect mismatch');
    expect(report.suites[0].latestRun?.failureReason).toBe('Auth redirect mismatch');
    expect(report.suites[0].latestRun?.firstFailureStep?.title).toBe('unknown-step');
    expect(report.suites[0].recentHistory).toHaveLength(2);
    expect(report.suites[0].recentHistory[1].status).toBe('pass');
    expect(report.suites[1].suiteKey).toBe('password-reset-public-journeys');
    expect(report.suites[1].latestRun?.status).toBe('pass');
    expect(report.statusCounts.fail).toBe(1);
  });

  it('records a synthetic run using the reliability ingest contract', async () => {
    repo.save.mockImplementation(async (value) => ({ id: 'run-3', ...value }));
    const service = new SyntheticReliabilityService(repo);

    const result = await service.recordRun({
      suiteKey: 'landing-public-journeys',
      status: 'pass',
      startedAt: '2026-04-12T10:00:00.000Z',
      completedAt: '2026-04-12T10:02:00.000Z',
      durationMs: 120000,
      summary: { summary: 'Landing/auth synthetic passed' },
      stepResults: [{ step: 'landing', status: 'passed' }],
      source: 'workflow',
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        runType: 'synthetic_transaction',
        scenarioKey: 'landing-public-journeys',
        status: 'succeeded',
        summaryJson: expect.objectContaining({
          syntheticStatus: 'pass',
          syntheticSource: 'workflow',
        }),
      }),
    );
    expect(result.status).toBe('pass');
  });
});
