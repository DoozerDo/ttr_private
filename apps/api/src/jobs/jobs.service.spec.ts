import { JobsService } from './jobs.service';

describe('JobsService', () => {
  const createService = () =>
    new JobsService({ create: jest.fn(), save: jest.fn() } as never);

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('rejects localhost URLs during ingestion', async () => {
    const service = createService();

    await expect(
      service.ingestJobDescription({ url: 'http://localhost/job' }),
    ).rejects.toThrow('Job URLs hosted on private networks are not allowed.');
  });

  it('rejects private IP URLs during ingestion', async () => {
    const service = createService();

    await expect(
      service.ingestJobDescription({ url: 'https://10.0.0.5/role' }),
    ).rejects.toThrow('Job URLs hosted on private networks are not allowed.');
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
      headers: {
        get: (key: string) =>
          key.toLowerCase() === 'content-type'
            ? 'text/html; charset=utf-8'
            : null,
      },
      arrayBuffer: () => Promise.resolve(Buffer.from(html)),
    } as never);

    const result = await service.ingestJobDescription({
      url: 'https://example.com/job',
    });

    expect(result.rawDescription.length).toBeGreaterThan(1000);
    expect(result.originalRawDescription.length).toBeGreaterThanOrEqual(
      result.rawDescription.length,
    );
    expect(result.responsibilities).toContain('Build features');
    expect(result.requirements).toContain('5+ years');
  });

  it('sanitizes LinkedIn boilerplate during ingestion', async () => {
    const service = createService();
    const filler = 'A'.repeat(1100);
    const html = `
      <article>
        <h2>Responsibilities</h2>
        <ul><li>Build features</li></ul>
        <p>${filler}</p>
        <p>Experts add insights directly into each article, started with the help of AI.</p>
        <p>Explore More</p>
      </article>
    `;

    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: {
        get: (key: string) =>
          key.toLowerCase() === 'content-type'
            ? 'text/html; charset=utf-8'
            : null,
      },
      arrayBuffer: () => Promise.resolve(Buffer.from(html)),
    } as never);

    const result = await service.ingestJobDescription({
      url: 'https://www.linkedin.com/jobs/view/123',
    });

    expect(result.rawDescription).not.toMatch(/Experts add insights/i);
    expect(result.rawDescription).not.toMatch(/Explore More/i);
    expect(result.originalRawDescription).toMatch(/Experts add insights/i);
  });
});
