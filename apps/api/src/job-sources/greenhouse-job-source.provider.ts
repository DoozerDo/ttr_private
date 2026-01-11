import { BadRequestException, Injectable } from '@nestjs/common';
import { JobSourceFetchCacheService } from './job-source-fetch-cache.service';
import { JobSourceProvider } from './job-source.provider';
import { JobSourceListing, JobSourceInput, JobDetailRaw, ParsedJob } from './job-source.types';
import { SearchSetSourceType } from '../search-sets/search-set.entity';
import { extractTextFromHtml } from '../jobs/html-utils';

type GreenhouseJobPayload = Record<string, any>;

@Injectable()
export class GreenhouseJobSourceProvider implements JobSourceProvider {
  readonly id = 'greenhouse';

  constructor(private readonly cache: JobSourceFetchCacheService) {}

  canHandle(input: JobSourceInput): boolean {
    return input.sourceType === SearchSetSourceType.GREENHOUSE;
  }

  async fetchListings(input: JobSourceInput): Promise<JobSourceListing[]> {
    const boardSlug = this.extractBoardSlug(input.sourceUrl);
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardSlug}/jobs`;

    const { value } = await this.cache.fetch(this.id, apiUrl, async () => {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new BadRequestException('Could not fetch jobs from Greenhouse.');
      }
      return response.json();
    });

    const jobs = Array.isArray((value as any)?.jobs) ? (value as any).jobs : [];

    return jobs
      .map((job) => {
        const externalId = job?.id ? String(job.id) : undefined;
        const title =
          typeof job?.title === 'string'
            ? job.title
            : typeof job?.name === 'string'
              ? job.name
              : 'Untitled role';

        const absoluteUrl =
          typeof job?.absolute_url === 'string'
            ? job.absolute_url
            : `/jobs/${externalId ?? ''}`;

        return {
          externalId: externalId ?? '',
          title,
          location:
            job?.location?.name && typeof job.location.name === 'string'
              ? job.location.name
              : null,
          url: this.normalizeAbsoluteUrl(absoluteUrl, boardSlug),
          postedAt: this.parseDate(job?.updated_at ?? job?.posted_at),
        };
      })
      .filter((entry) => entry.externalId && entry.url);
  }

  async fetchJobDetail(listing: JobSourceListing): Promise<JobDetailRaw> {
    const boardSlug = this.extractBoardSlugFromListing(listing.url);
    const { jobId } = this.parseListingForJob(listing.url);
    if (!boardSlug || !jobId) {
      throw new BadRequestException('Could not determine Greenhouse job details.');
    }

    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardSlug}/jobs/${jobId}?content=true`;

    const { value } = await this.cache.fetch(this.id, apiUrl, async () => {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new BadRequestException('Could not fetch Greenhouse job detail.');
      }
      return response.json();
    });

    const metadata = value as GreenhouseJobPayload;
    const html = typeof metadata.content === 'string' ? metadata.content : '';
    const fetchedAt =
      typeof metadata.updated_at === 'string'
        ? new Date(metadata.updated_at)
        : new Date();

    return {
      url: listing.url,
      html,
      fetchedAt,
      metadata,
    };
  }

  parseJob(detail: JobDetailRaw): ParsedJob {
    const metadata = detail.metadata ?? {};
    const title =
      typeof metadata.title === 'string'
        ? metadata.title
        : typeof metadata.position === 'string'
          ? metadata.position
          : 'Open role';

    const company =
      typeof metadata.company === 'string'
        ? metadata.company
        : typeof metadata.company_name === 'string'
          ? metadata.company_name
          : null;

    const location = this.readLocationName(metadata.location);

    const applyUrl =
      typeof metadata.apply_url === 'string'
        ? metadata.apply_url
        : detail.url;

    const descriptionText = extractTextFromHtml(detail.html);
    const externalId =
      metadata.id ??
      metadata.job_id ??
      metadata.internal_job_id ??
      this.extractJobIdFromUrl(detail.url);

    if (!externalId) {
      throw new BadRequestException('Greenhouse job detail missing identifier.');
    }

    return {
      title,
      company,
      location,
      descriptionText,
      responsibilities: [],
      requirements: [],
      applyUrl,
      sourceUrl: detail.url,
      externalId: String(externalId),
    };
  }

  private readLocationName(location: unknown): string | null {
    if (typeof location === 'string') {
      return location;
    }
    if (!location || typeof location !== 'object') {
      return null;
    }
    const loc = location as Record<string, unknown>;
    return typeof loc.name === 'string' ? loc.name : null;
  }

  private extractBoardSlug(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/embed/job_board')) {
        const slug = parsed.searchParams.get('for');
        if (slug) {
          return slug;
        }
      }
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length > 0 && segments[0] !== 'embed') {
        return segments[0];
      }
    } catch {
      // fall through
    }
    throw new BadRequestException('Invalid Greenhouse board URL.');
  }

  private extractBoardSlugFromListing(url: string) {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length > 0 && segments[0] !== 'jobs') {
        return segments[0];
      }
    } catch {
      // fall through
    }
    return null;
  }

  private parseListingForJob(url: string) {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const jobIndex = segments.findIndex((segment) => segment === 'jobs');
      const jobId = jobIndex >= 0 ? segments[jobIndex + 1] : segments[segments.length - 1];
      return { jobId };
    } catch {
      return { jobId: null };
    }
  }

  private normalizeAbsoluteUrl(path: string, boardSlug: string) {
    try {
      if (path.startsWith('http')) {
        return path;
      }
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      return new URL(normalizedPath, `https://boards.greenhouse.io/${boardSlug}`).toString();
    } catch {
      return `https://boards.greenhouse.io/${boardSlug}${path.startsWith('/') ? path : `/${path}`}`;
    }
  }

  private parseDate(value: unknown) {
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return null;
  }

  private extractJobIdFromUrl(url: string) {
    const { jobId } = this.parseListingForJob(url);
    return jobId;
  }
}
