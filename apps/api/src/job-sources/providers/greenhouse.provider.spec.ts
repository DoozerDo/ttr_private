import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JobSourceFetchCacheService } from '../job-source-fetch-cache.service';
import { GreenhouseJobSourceProvider } from './greenhouse.provider';

const FIXTURE_DIR = join(__dirname, '../fixtures/greenhouse');
const listingHtml = readFileSync(join(FIXTURE_DIR, 'listing.html'), 'utf-8');
const headingHtml = readFileSync(join(FIXTURE_DIR, 'job-heading.html'), 'utf-8');
const minimalHtml = readFileSync(join(FIXTURE_DIR, 'job-minimal.html'), 'utf-8');

describe('GreenhouseJobSourceProvider', () => {
  const boardUrl = 'https://boards.greenhouse.io/example';
  const headingUrl = `${boardUrl}/jobs/123`;
  const minimalUrl = `${boardUrl}/jobs/minimal`;

  let provider: GreenhouseJobSourceProvider;
  let cache: JobSourceFetchCacheService;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeAll(() => {
    originalFetch = (globalThis as any).fetch;
  });

  beforeEach(() => {
    cache = new JobSourceFetchCacheService();
    provider = new GreenhouseJobSourceProvider(cache);
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }

    jest.resetAllMocks();
  });

  it('extracts listings with external IDs from a board page', async () => {
    (globalThis as any).fetch = jest.fn(async (url: string) => {
      if (url === boardUrl) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from(listingHtml),
        };
      }
      throw new Error('Unexpected fetch');
    });

    const listings = await provider.fetchListings({
      sourceType: 'GREENHOUSE' as any,
      sourceUrl: boardUrl,
    });

    const ids = listings.map((listing) => listing.externalId);
    expect(listings.length).toBe(3);
    expect(new Set(ids).size).toBe(3);
    expect(listings[0].title).toContain('Senior');
    expect(listings[0].url).toContain('/jobs/123');
  });

  it('limits listings when maxListings option is provided', async () => {
    (globalThis as any).fetch = jest.fn(async (url: string) => {
      if (url === boardUrl) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from(listingHtml),
        };
      }
      throw new Error('Unexpected fetch');
    });

    const listings = await provider.fetchListings({
      sourceType: 'GREENHOUSE' as any,
      sourceUrl: boardUrl,
      options: { maxListings: 2 },
    });

    expect(listings).toHaveLength(2);
  });

  it('parses job detail with headings and bullets', () => {
    const parsed = provider.parseJob({
      url: headingUrl,
      html: headingHtml,
      fetchedAt: new Date(),
      metadata: { externalId: '123' },
    });

    expect(parsed.title).toContain('Senior Engineer');
    expect(parsed.company).toBe('Acme Corporation');
    expect(parsed.location).toBe('Remote');
    expect(parsed.descriptionText).toContain('Drive core platform');
    expect(parsed.responsibilities).toHaveLength(2);
    expect(parsed.requirements).toHaveLength(2);
    expect(parsed.applyUrl).toBe('https://boards.greenhouse.io/apply/123');
  });

  it('parses fallback structure when headings are missing', () => {
    const parsed = provider.parseJob({
      url: minimalUrl,
      html: minimalHtml,
      fetchedAt: new Date(),
      metadata: { externalId: 'minimal' },
    });

    expect(parsed.title).toContain('Junior Engineer');
    expect(parsed.responsibilities).toHaveLength(1);
    expect(parsed.requirements).toHaveLength(1);
    expect(parsed.applyUrl).toBe('https://boards.greenhouse.io/apply/minimal');
    expect(parsed.descriptionText).toContain('Support the product');
  });
});
