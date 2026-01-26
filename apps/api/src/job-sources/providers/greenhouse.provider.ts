import { BadRequestException, Injectable } from '@nestjs/common';
import { JobSourceFetchCacheService } from '../job-source-fetch-cache.service';
import { JobSourceHttpService } from '../job-source-http.service';
import { JobSourceProvider } from '../job-source.provider';
import {
  JobSourceInput,
  JobSourceListing,
  JobDetailRaw,
  ParsedJob,
} from '../job-source.types';
import { extractTextFromHtml } from '../../jobs/html-utils';

const RESPONSIBILITY_HEADINGS = [
  'responsibilities',
  'what you will do',
  'what you will be doing',
  'you will',
  'your impact',
];

const REQUIREMENT_HEADINGS = [
  'requirements',
  'qualifications',
  'you have',
  'what we need',
  'you bring',
];

@Injectable()
export class GreenhouseJobSourceProvider implements JobSourceProvider {
  readonly id = 'greenhouse';

  private readonly fetchOptions = {
    timeoutMs: 15_000,
    maxBytes: 1_000_000,
  };

  constructor(
    private readonly cache: JobSourceFetchCacheService,
    private readonly jobSourceHttp: JobSourceHttpService,
  ) {}

  canHandle(input: JobSourceInput): boolean {
    return input.sourceType === 'greenhouse';
  }

  async fetchListings(input: JobSourceInput): Promise<JobSourceListing[]> {
    const maxListings = this.normalizeMaxListings(input.options);
    const boardUrl = await this.resolveBoardUrl(input.sourceUrl);
    const html = await this.fetchBoardHtml(boardUrl);
    const listings = this.extractListingsFromHtml(html, boardUrl, maxListings);

    return listings;
  }

  async fetchJobDetail(listing: JobSourceListing): Promise<JobDetailRaw> {
    const html = await this.fetchBoardHtml(listing.url);

    return {
      url: listing.url,
      html,
      fetchedAt: new Date(),
      metadata: {
        externalId: listing.externalId,
      },
    };
  }

  parseJob(detail: JobDetailRaw): ParsedJob {
    const html = detail.html;
    const sanitized = extractTextFromHtml(html);
    const title = this.extractTitle(html, sanitized);
    const company =
      this.extractMetaContent(html, ['og:site_name', 'twitter:site']) ??
      this.extractLabelValue(sanitized, 'company');
    const location =
      this.extractLocationFromHtml(html, sanitized) ??
      this.extractLabelValue(sanitized, 'location');
    const descriptionText = sanitized;
    const { responsibilities, requirements } =
      this.extractResponsibilitiesAndRequirements(sanitized);
    const applyUrl = this.extractApplyUrl(html, detail.url) ?? detail.url;
    const externalId =
      detail.metadata?.externalId ?? this.extractExternalIdFromUrl(detail.url);

    if (!externalId) {
      throw new BadRequestException(
        'Greenhouse job detail missing identifier.',
      );
    }

    return {
      title,
      company,
      location,
      descriptionText,
      responsibilities,
      requirements,
      applyUrl,
      sourceUrl: detail.url,
      externalId: String(externalId),
    };
  }

  private async resolveBoardUrl(rawUrl: string): Promise<string> {
    const normalized = this.normalizeUrl(rawUrl);
    if (!normalized) {
      throw new BadRequestException('Invalid Greenhouse URL provided.');
    }

    const parsed = new URL(normalized);
    if (parsed.hostname.endsWith('greenhouse.io')) {
      return normalized;
    }

    const html = await this.fetchBoardHtml(normalized);
    const embedUrl = this.extractEmbedUrl(html);

    if (!embedUrl) {
      throw new BadRequestException(
        'Could not locate Greenhouse job board in provided page.',
      );
    }

    return embedUrl;
  }

  private extractListingsFromHtml(
    html: string,
    baseUrl: string,
    maxListings: number,
  ): JobSourceListing[] {
    const regex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Map<string, JobSourceListing>();
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) && seen.size < maxListings) {
      const href = match[1];
      const url = this.normalizeHref(href, baseUrl);
      if (!url || !this.isGreenhouseJobUrl(url)) {
        continue;
      }

      const externalId = this.extractExternalIdFromUrl(url);
      if (!externalId || seen.has(externalId)) continue;

      const title =
        this.extractTextFromSnippet(match[2]) || `Job ${externalId}`;
      const location = this.extractLocationFromAnchor(match[0]);
      const postedAt = this.extractDateFromAnchorAttributes(match[0]);

      seen.set(externalId, {
        externalId,
        title,
        url,
        location,
        postedAt,
      });
    }

    return Array.from(seen.values());
  }

  private extractTextFromSnippet(snippet: string) {
    const stripped = extractTextFromHtml(snippet);
    return stripped ? stripped.trim() : null;
  }

  private extractDateFromAnchorAttributes(tag: string): Date | null {
    const match = tag.match(/data-posted=["']([^"']+)["']/i);
    if (match) {
      const parsed = new Date(match[1]);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return null;
  }

  private extractLocationFromAnchor(tag: string): string | null {
    const match = tag.match(/data-location=["']([^"']+)["']/i);
    if (match) {
      return match[1].trim();
    }

    const ariaMatch = tag.match(/aria-label=["']([^"']+)["']/i);
    if (ariaMatch && ariaMatch[1]) {
      const parts = ariaMatch[1].split(',');
      if (parts.length > 1) {
        return parts[parts.length - 1].trim();
      }
    }

    return null;
  }

  private extractEmbedUrl(html: string): string | null {
    const iframeMatch = html.match(
      /<iframe[^>]+src=["']([^"']*boards\.greenhouse\.io[^"']*)["'][^>]*>/i,
    );
    if (iframeMatch) {
      return this.normalizeUrl(iframeMatch[1]) ?? null;
    }

    const linkMatch = html.match(
      /<a[^>]+href=["']([^"']*boards\.greenhouse\.io[^"']*)["'][^>]*>/i,
    );
    if (linkMatch) {
      return this.normalizeUrl(linkMatch[1]) ?? null;
    }

    return null;
  }

  private normalizeMaxListings(options?: Record<string, unknown> | null) {
    const raw = options?.['maxListings'];
    let candidate: number | null = null;
    if (typeof raw === 'number') {
      candidate = raw;
    } else if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) {
        candidate = parsed;
      }
    }

    if (candidate && Number.isFinite(candidate)) {
      return Math.min(Math.max(1, Math.floor(candidate)), 200);
    }

    return 50;
  }

  private extractResponsibilitiesAndRequirements(text: string) {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const responsibilities: string[] = [];
    const requirements: string[] = [];
    const fallback: string[] = [];
    let current: 'responsibilities' | 'requirements' | null = null;

    for (const line of lines) {
      const lower = line.toLowerCase();

      if (/^apply\b/.test(lower)) {
        current = null;
        continue;
      }

      if (RESPONSIBILITY_HEADINGS.some((heading) => lower.includes(heading))) {
        current = 'responsibilities';
        continue;
      }

      if (REQUIREMENT_HEADINGS.some((heading) => lower.includes(heading))) {
        current = 'requirements';
        continue;
      }

      const bulletMatch = line.match(/^[-•*]\s+(.*)/);
      if (bulletMatch) {
        const payload = bulletMatch[1].trim();
        fallback.push(payload);
        if (current === 'responsibilities') {
          responsibilities.push(payload);
        } else if (current === 'requirements') {
          requirements.push(payload);
        }
        continue;
      }

      if (current === 'responsibilities') {
        responsibilities.push(line);
      } else if (current === 'requirements') {
        requirements.push(line);
      }
    }

    if (!responsibilities.length && fallback.length) {
      responsibilities.push(
        ...fallback.slice(0, Math.ceil(fallback.length / 2)),
      );
    }

    if (!requirements.length && fallback.length) {
      requirements.push(...fallback.slice(Math.ceil(fallback.length / 2)));
    }

    return {
      responsibilities,
      requirements,
    };
  }

  private extractApplyUrl(html: string, baseUrl: string): string | null {
    const anchorRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = anchorRegex.exec(html))) {
      const text = match[2];
      if (text && /apply/i.test(text)) {
        const normalized = this.normalizeHref(match[1], baseUrl);
        if (normalized) {
          return normalized;
        }
      }
    }

    const formMatch = html.match(/<form[^>]+action=["']([^"']+)["'][^>]*>/i);
    if (formMatch) {
      return this.normalizeHref(formMatch[1], baseUrl);
    }

    return null;
  }

  private extractTitle(html: string, sanitized: string): string {
    const headingMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (headingMatch) {
      return extractTextFromHtml(headingMatch[1]).trim();
    }

    const firstLine = sanitized
      .split('\n')
      .find((line) => line.trim().length > 0);
    return firstLine?.trim() ?? 'Greenhouse role';
  }

  private extractLocationFromHtml(
    html: string,
    sanitized: string,
  ): string | null {
    const locationMatch = html.match(/data-location=["']([^"']+)["']/i);
    if (locationMatch) {
      return locationMatch[1].trim();
    }

    const locationLine = sanitized
      .split('\n')
      .find((line) => /^location[:\s]/i.test(line));
    if (locationLine) {
      const parts = locationLine.split(/[:\-]/);
      if (parts.length > 1) {
        return parts.slice(1).join(':').trim();
      }
    }

    return null;
  }

  private extractLabelValue(text: string, label: string) {
    const match = text.match(new RegExp(`${label}[:\\s]+(.+)`, 'i'));
    if (match) {
      return match[1].trim();
    }
    return null;
  }

  private extractMetaContent(html: string, keys: string[]): string | null {
    for (const key of keys) {
      const regex = new RegExp(
        `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        'i',
      );
      const match = html.match(regex);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  private extractExternalIdFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const jobsIndex = segments.indexOf('jobs');
      const jobIndex = jobsIndex >= 0 ? jobsIndex + 1 : segments.length - 1;
      if (jobIndex >= 0 && jobIndex < segments.length) {
        return segments[jobIndex];
      }
    } catch {
      // ignore
    }
    return null;
  }

  private isGreenhouseJobUrl(url: string) {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.includes('greenhouse.io') &&
        parsed.pathname.includes('/jobs/')
      );
    } catch {
      return false;
    }
  }

  private normalizeUrl(raw: string): string | null {
    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private normalizeHref(raw: string, base: string): string | null {
    try {
      const parsed = new URL(raw, base);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private async fetchBoardHtml(url: string): Promise<string> {
    const { value } = await this.cache.fetch(this.id, url, async () => {
      return this.jobSourceHttp.fetch(url, this.fetchOptions);
    });
    return value;
  }
}
