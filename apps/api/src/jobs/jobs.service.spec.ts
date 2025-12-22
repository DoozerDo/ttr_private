import { JobsService } from './jobs.service';

describe('JobsService', () => {
  const createService = () =>
    new JobsService({ create: jest.fn(), save: jest.fn() } as never);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ingests job descriptions from a URL', async () => {
    const service = createService();
    const filler = 'A'.repeat(1100);
    const html = `
      <article>
        <h2>Responsibilities</h2>
        <ul><li>Build features</li></ul>
        <h2>Requirements</h2>
        <ul><li>5+ years</li></ul>
        <p>${filler}</p>
      </article>
    `;

    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => Buffer.from(html),
    } as never);

    const result = await service.ingestJobDescription({
      url: 'https://example.com/job',
    });

    expect(result.rawDescription.length).toBeGreaterThan(1000);
    expect(result.responsibilities).toContain('Build features');
    expect(result.requirements).toContain('5+ years');
  });
});
