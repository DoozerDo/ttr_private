import type { ConfigService } from '@nestjs/config';
import { CriticalFlowEventType, CriticalFlowTrackerService } from './critical-flow-tracker.service';

describe('CriticalFlowTrackerService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.resetAllMocks();
  });

  const configService = {
    get(key: string) {
      switch (key) {
        case 'GITHUB_BUG_REPORT_OWNER':
          return 'owner';
        case 'GITHUB_BUG_REPORT_REPO':
          return 'repo';
        case 'GITHUB_BUG_REPORT_TOKEN':
          return 'token';
        default:
          return undefined;
      }
    },
  } as ConfigService;

  it('tracks flow events and calculates rolling metrics', async () => {
    const service = new CriticalFlowTrackerService(configService);
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.SCORE_GENERATED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.SCORE_GENERATED_FAILURE });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.SCORE_GENERATED_SUCCESS });

    const scoreFlow = service.getCriticalFlowHealth().find((item) => item.flowName === 'score_generated');
    expect(scoreFlow?.totalAttempts).toBe(3);
    expect(scoreFlow?.totalFailures).toBe(1);
    expect(scoreFlow?.successRatePct).toBeCloseTo(66.7, 1);
  });

  it('classifies statuses using deterministic thresholds', async () => {
    const service = new CriticalFlowTrackerService(configService);
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.BASELINE_PARSED_FAILURE });

    const baselineFlow = service.getCriticalFlowHealth().find((item) => item.flowName === 'baseline_parsed');
    expect(baselineFlow?.status).toBe('Degraded');
    expect(baselineFlow?.thresholdPct).toBe(10);
  });

  it('creates one critical escalation issue on state change and dedupes repeats', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ number: 999, html_url: 'https://github.com/o/r/issues/999', id: 90 }),
    });
    (globalThis.fetch as jest.MockedFunction<typeof fetch>) = fetchMock as unknown as typeof globalThis.fetch;
    const service = new CriticalFlowTrackerService(configService);

    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.RESUME_GENERATED_SUCCESS });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.RESUME_GENERATED_FAILURE });
    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.RESUME_GENERATED_FAILURE });

    const first = service.getCriticalFlowHealth().find((item) => item.flowName === 'resume_generated');
    expect(first?.status).toBe('Critical');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.recordCriticalFlowEvent({ flow: CriticalFlowEventType.RESUME_GENERATED_FAILURE });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
