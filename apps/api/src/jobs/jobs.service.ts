import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isIP } from 'node:net';
import { Repository } from 'typeorm';
import { Job, JobIngestionMethod } from './job.entity';
import { extractTextFromHtml } from './html-utils';
import { normalizeJobDescription, sanitizeListItems } from './jd-normalization';

export type CreateJobInput = {
  title?: string | null;
  company?: string | null;
  rawDescription: string;
  sourceUrl?: string | null;
  responsibilities?: string[];
  requirements?: string[];
  jdIngestionMethod?: JobIngestionMethod;
  sourceProviderId?: string | null;
  sourceExternalId?: string | null;
  canonicalUrl?: string | null;
  dedupeHash?: string | null;
};

export type IngestJobDescriptionInput = {
  pastedText?: string;
  url?: string;
};

export type IngestJobDescriptionResult = {
  rawDescription: string;
  responsibilities: string[];
  requirements: string[];
  warning?: JobWarning | null;
};

export type JobWarning = {
  status: number;
  code: string;
  message: string;
  details?: string | null;
};

export type CreateJobResult = {
  job: Job;
  warning?: JobWarning;
};

const MIN_DESCRIPTION_LENGTH = 1000;
const MAX_DESCRIPTION_LENGTH = 100000;
const MAX_HTML_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const JOB_LIMIT = 5;
const ALLOW_JOB_LIMIT_SKIP =
  process.env.NODE_ENV !== "production" ||
  process.env.DISABLE_JOB_LIMIT === "true";

const ALLOWED_CONTENT_TYPES = new Set(['text/html', 'text/plain']);
const PRIVATE_NETWORK_URL_ERROR =
  'Job URLs hosted on private networks are not allowed.';
const FETCH_TIMEOUT_MESSAGE = 'Job description request timed out.';
const FETCH_FAILURE_MESSAGE =
  'Unable to retrieve the job description from the provided URL.';
const CONTENT_TYPE_ERROR =
  'Job description content must be served as HTML or plain text.';
const NORMALIZATION_WARNING_MESSAGE =
  'We could not fully parse this job description, but it was saved successfully.';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  async ingestJobDescription(
    input: IngestJobDescriptionInput,
  ): Promise<IngestJobDescriptionResult> {
    const pastedText = input.pastedText?.trim();
    const url = input.url?.trim();
    const hasText = Boolean(pastedText);
    const hasUrl = Boolean(url);

    if (hasText === hasUrl) {
      throw new BadRequestException('Provide exactly one of pastedText or url.');
    }

    if (hasUrl) {
      const sanitizedUrl = this.validateUrl(url!);
      const html = await this.fetchHtml(sanitizedUrl);
      const extracted = this.normalizeRawDescription(extractTextFromHtml(html));
      this.validateDescriptionLength(extracted);
      const normalizedOutcome = this.normalizeSafely(extracted);
      return {
        rawDescription: extracted,
        responsibilities: normalizedOutcome.responsibilities,
        requirements: normalizedOutcome.requirements,
        warning: normalizedOutcome.warning,
      };
    }

    const normalizedText = this.normalizeRawDescription(pastedText!);
    this.validateDescriptionLength(normalizedText);
    const normalizedOutcome = this.normalizeSafely(normalizedText);

    return {
      rawDescription: normalizedText,
      responsibilities: normalizedOutcome.responsibilities,
      requirements: normalizedOutcome.requirements,
      warning: normalizedOutcome.warning,
    };
  }

  async createJob(userId: string, payload: CreateJobInput): Promise<CreateJobResult> {
    const rawDescription = this.normalizeRawDescription(payload.rawDescription);
    this.validateDescriptionLength(rawDescription);

    const normalizedOutcome = this.normalizeSafely(rawDescription);
    const responsibilities =
      payload.responsibilities && payload.responsibilities.length > 0
        ? sanitizeListItems(payload.responsibilities)
        : normalizedOutcome.responsibilities;
    const requirements =
      payload.requirements && payload.requirements.length > 0
        ? sanitizeListItems(payload.requirements)
        : normalizedOutcome.requirements;

    const ingestionMethod =
      payload.jdIngestionMethod ?? JobIngestionMethod.PASTE;

    const allowedIngestionMethods = [
      JobIngestionMethod.PASTE,
      JobIngestionMethod.URL,
      JobIngestionMethod.SOURCE_PROVIDER,
    ];

    if (!allowedIngestionMethods.includes(ingestionMethod)) {
      throw new BadRequestException('Invalid jdIngestionMethod value');
    }

    const sourceUrl = payload.sourceUrl?.trim() || null;
    if (sourceUrl) {
      this.validateUrl(sourceUrl);
    }
    if (
      (ingestionMethod === JobIngestionMethod.URL ||
        ingestionMethod === JobIngestionMethod.SOURCE_PROVIDER) &&
      !sourceUrl
    ) {
      throw new BadRequestException(
        'sourceUrl is required for URL or provider ingestion.',
      );
    }

    const sourceProviderId = payload.sourceProviderId?.trim() || null;
    const sourceExternalId = payload.sourceExternalId?.trim() || null;
    const canonicalUrl = payload.canonicalUrl?.trim() || null;
    const dedupeHash = payload.dedupeHash?.trim() || null;

    await this.enforceJobLimit(userId);

    const job = this.jobRepository.create({
      userId,
      title: payload.title?.trim() || null,
      company: payload.company?.trim() || null,
      rawDescription,
      sourceUrl,
      sourceProviderId,
      sourceExternalId,
      canonicalUrl,
      dedupeHash,
      normalizedResponsibilities: responsibilities,
      normalizedRequirements: requirements,
      jdIngestionMethod: ingestionMethod,
      jdParsedAt: new Date(),
    });

    const savedJob = await this.jobRepository.save(job);
    return { job: savedJob, warning: normalizedOutcome.warning };
  }

  async listJobsForUser(userId: string, includeArchived = false) {
    const where = includeArchived ? { userId } : { userId, isArchived: false };

    return this.jobRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getJobForUser(id: string, userId: string) {
    return this.findJobForUser(id, userId);
  }

  async archiveJob(jobId: string, userId: string) {
    const job = await this.findJobForUser(jobId, userId);

    if (job.isArchived && job.archivedAt) {
      return job;
    }

    job.isArchived = true;
    job.archivedAt = new Date();

    return this.jobRepository.save(job);
  }

  async restoreJob(jobId: string, userId: string) {
    const job = await this.findJobForUser(jobId, userId);

    if (!job.isArchived && !job.archivedAt) {
      return job;
    }

    job.isArchived = false;
    job.archivedAt = null;

    return this.jobRepository.save(job);
  }

  private async findJobForUser(jobId: string, userId: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  private normalizeRawDescription(rawDescription: string) {
    const normalized = rawDescription
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n');

    return normalized.trim();
  }

  private validateDescriptionLength(description: string) {
    if (
      description.length < MIN_DESCRIPTION_LENGTH ||
      description.length > MAX_DESCRIPTION_LENGTH
    ) {
      throw new BadRequestException(
        'Job description must be between 1,000 and 100,000 characters.',
      );
    }
  }

  private async enforceJobLimit(userId: string) {
    const count = await this.jobRepository.count({ where: { userId } });

    if (ALLOW_JOB_LIMIT_SKIP) {
      return;
    }

    if (count >= JOB_LIMIT) {
      throw new UnprocessableEntityException({
        error: {
          code: 'limit_reached',
          entity: 'job',
          limit: JOB_LIMIT,
        },
      });
    }
  }

  private validateUrl(inputUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(inputUrl);
    } catch {
      throw new BadRequestException('Invalid URL provided.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only http and https URLs are allowed.');
    }

    const normalizedHostname = normalizeHostname(parsed.hostname);
    if (
      isLocalHostname(normalizedHostname) ||
      isPrivateNetworkAddress(normalizedHostname)
    ) {
      throw new BadRequestException(PRIVATE_NETWORK_URL_ERROR);
    }

    return parsed.toString();
  }

  private async fetchHtml(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await this.fetchWithRedirects(url, controller.signal);

      if (response.status < 200 || response.status >= 300) {
        throw new BadRequestException(FETCH_FAILURE_MESSAGE);
      }

      this.ensureAllowedContentType(response);

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_HTML_BYTES) {
        throw new BadRequestException('Job description response is too large.');
      }

      return Buffer.from(buffer).toString('utf-8');
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        error instanceof Error &&
        (error.name === 'AbortError' || (error as any)?.name === 'AbortError')
      ) {
        throw new BadRequestException(FETCH_TIMEOUT_MESSAGE);
      }

      throw new BadRequestException(FETCH_FAILURE_MESSAGE);
    } finally {
      clearTimeout(timeout);
    }
  }

  private ensureAllowedContentType(response: Response) {
    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(CONTENT_TYPE_ERROR);
    }
  }

  private async fetchWithRedirects(
    url: string,
    signal: AbortSignal,
  ): Promise<Response> {
    let currentUrl = url;
    let redirects = 0;

    while (true) {
      const safeUrl = this.validateUrl(currentUrl);
      const response = await fetch(safeUrl, {
        redirect: 'manual',
        signal,
      });

      const location =
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get('location');

      if (location) {
        if (redirects >= MAX_REDIRECTS) {
          throw new BadRequestException(
            'Too many redirects while fetching URL.',
          );
        }

        currentUrl = new URL(location, safeUrl).toString();
        redirects += 1;
        continue;
      }

      return response;
    }
  }

  private normalizeSafely(rawDescription: string): {
    responsibilities: string[];
    requirements: string[];
    warning?: JobWarning;
  } {
    try {
      const normalized = normalizeJobDescription(rawDescription);
      return {
        responsibilities: normalized.responsibilities,
        requirements: normalized.requirements,
      };
    } catch (error) {
      console.error('Job normalization failed', error);
      return {
        responsibilities: [],
        requirements: [],
        warning: this.buildNormalizationWarning(error),
      };
    }
  }

  private buildNormalizationWarning(error: unknown): JobWarning {
    const details = error instanceof Error ? error.message : null;
    return {
      status: 200,
      code: 'normalization_failed',
      message: NORMALIZATION_WARNING_MESSAGE,
      details,
    };
  }
}

const normalizeHostname = (hostname: string) =>
  hostname.split('%')[0].toLowerCase();

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname.endsWith('.local');

const isPrivateNetworkAddress = (hostname: string) => {
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    return isPrivateIpv4(hostname);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(hostname);
  }
  return false;
};

const isPrivateIpv4 = (ipAddress: string) => {
  if (ipAddress.startsWith('10.')) return true;
  if (ipAddress.startsWith('127.')) return true;
  if (ipAddress.startsWith('169.254.')) return true;
  if (ipAddress.startsWith('192.168.')) return true;
  if (ipAddress.startsWith('0.')) return true;

  const [first, second] = ipAddress.split('.').map(Number);
  if (first === 172 && second >= 16 && second <= 31) return true;

  return false;
};

const IPV6_LOOPBACKS = new Set(['::1', '0:0:0:0:0:0:0:1']);
const IPV6_LINK_LOCAL_PREFIXES = ['fe8', 'fe9', 'fea', 'feb'];

const isPrivateIpv6 = (ipAddress: string) => {
  const normalized = ipAddress.toLowerCase();
  if (IPV6_LOOPBACKS.has(normalized)) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

  return IPV6_LINK_LOCAL_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
};

