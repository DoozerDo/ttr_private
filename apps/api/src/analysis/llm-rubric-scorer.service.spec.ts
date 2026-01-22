import { LlmRubricScorerService } from './llm-rubric-scorer.service';

const buildMessages = () => ({
  system: 'system',
  developer: 'developer',
  user: 'user',
});

describe('LlmRubricScorerService', () => {
  let service: LlmRubricScorerService;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new LlmRubricScorerService();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    process.env.OPENAI_API_KEY = 'test';
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    jest.resetAllMocks();
  });

  it('rejects invalid JSON from the model', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json' } }],
      }),
    });

    const result = await service.score(buildMessages());

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_json');
  });

  it('rejects scores outside the valid range', async () => {
    const payload = JSON.stringify({
      scoringPromptVersion: 'v1',
      score: 200,
      verdict: 'Strong',
      dimensionScores: {
        experience: 50,
        leadership: 50,
        technicalPlatform: 50,
        industryContext: 50,
        strategicBalance: 50,
      },
      notes: 'ok',
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: payload } }],
      }),
    });

    const result = await service.score(buildMessages());

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('score_out_of_range');
  });
});
