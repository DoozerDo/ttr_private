import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceAction } from '../compliance/compliance.types';
import { ComplianceService } from '../compliance/compliance.service';
import {
  Application,
  ApplicationStage,
  ApplicationTrackerStatus,
  OutcomeLinkageSnapshot,
  ResumeArtifactRecord,
  VerificationCoverageSnapshot,
} from './application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';

export type ListApplicationsFilters = {
  stage?: ApplicationStage;
  company?: string;
};

export type CxFitScoreSnapshot = {
  overallScore: number;
  verdict: string;
  dimensionScores: Record<string, number>;
  weights?: Record<string, number>;
  scoringContractVersion?: string;
  createdAt: string;
};

export type ResumeGenerationTrackerInput = {
  userId: string;
  jobId?: string | null;
  companyName?: string | null;
  roleTitle?: string | null;
  jobUrl?: string | null;
  jobText?: string | null;
  baselineVersionId?: string | null;
  cxFitScoreSnapshot?: CxFitScoreSnapshot | null;
  resumeArtifactId: string;
  resumeArtifactType?: 'resume' | 'cover';
  resumeArtifactFormat?: string | null;
  analysisId?: string | null;
  baselineId?: string | null;
  verificationCoverageSnapshot?: VerificationCoverageSnapshot | null;
  outcomeLinkageSnapshot?: OutcomeLinkageSnapshot | null;
};

export type PairApplicationUpsertInput = {
  userId: string;
  baselineId?: string | null;
  jobId?: string | null;
  companyName?: string | null;
  roleTitle?: string | null;
  jobUrl?: string | null;
  analysisId?: string | null;
  baselineVersionId?: string | null;
  applicationStatus?: ApplicationTrackerStatus | null;
  appliedDate?: Date | string | null;
  fitScore?: number | null;
  notes?: string | null;
  sourceUrl?: string | null;
  externalApplicationUrl?: string | null;
  verificationCoverageSnapshot?: VerificationCoverageSnapshot | null;
  outcomeLinkageSnapshot?: OutcomeLinkageSnapshot | null;
  resumeArtifactId?: string | null;
  resumeArtifactType?: 'resume' | 'cover' | null;
  resumeArtifactFormat?: string | null;
};

export type ApplicationInsight = {
  message: string;
  type: 'warning' | 'success' | 'gap';
};

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    private readonly complianceService: ComplianceService,
  ) {}

  async createApplication(userId: string, dto: CreateApplicationDto) {
    if (!dto.company?.trim()) {
      throw new BadRequestException('Company is required.');
    }
    if (!dto.title?.trim()) {
      throw new BadRequestException('Title is required.');
    }

    const now = new Date();
    const appliedAt =
      dto.stage === ApplicationStage.APPLIED && dto.appliedDate
        ? new Date(dto.appliedDate)
        : dto.appliedDate
        ? new Date(dto.appliedDate)
        : null;
    const applicationStatus =
      dto.applicationStatus ??
      (dto.stage === ApplicationStage.APPLIED
        ? ApplicationTrackerStatus.APPLIED
        : ApplicationTrackerStatus.PREPARED);

    const application = this.applicationRepository.create({
      userId,
      jobId: dto.jobId || null,
      company: dto.company.trim(),
      title: dto.title.trim(),
      jobUrl: this.normalizeUrl(dto.externalApplicationUrl ?? dto.sourceUrl),
      fingerprint: this.buildManualFingerprint(),
      status: applicationStatus,
      preparedAt: now,
      appliedAt,
      lastTouchedAt: now,
      baselineVersionId: null,
      baselineId: dto.baselineId?.trim() || null,
      analysisId: dto.analysisId?.trim() || null,
      appliedDate: appliedAt,
      fitScore: dto.fitScore ?? null,
      stage: dto.stage ?? ApplicationStage.SAVED,
      notes: dto.notes?.trim() || null,
      sourceUrl: this.normalizeUrl(dto.externalApplicationUrl ?? dto.sourceUrl),
      cxFitScoreSnapshot: {},
      resumeArtifacts: [],
      verificationCoverageSnapshot:
        this.normalizeVerificationCoverageSnapshot(dto.verificationCoverageSnapshot),
      outcomeLinkageSnapshot:
        this.normalizeOutcomeLinkageSnapshot(dto.outcomeLinkageSnapshot),
    });

    return this.applicationRepository.save(application);
  }

  async listApplicationsForUser(
    userId: string,
    filters?: ListApplicationsFilters,
  ) {
    const queryBuilder = this.applicationRepository
      .createQueryBuilder('application')
      .where('application.userId = :userId', { userId });

    if (filters?.stage) {
      queryBuilder.andWhere('application.stage = :stage', {
        stage: filters.stage,
      });
    }

    if (filters?.company) {
      queryBuilder.andWhere('LOWER(application.company) LIKE LOWER(:company)', {
        company: `%${filters.company}%`,
      });
    }

    queryBuilder.orderBy('application.lastTouchedAt', 'DESC');

    return queryBuilder.getMany();
  }

  async getApplicationForUser(id: string, userId: string) {
    const application = await this.applicationRepository.findOne({
      where: { id, userId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  async updateApplication(
    id: string,
    userId: string,
    dto: UpdateApplicationDto,
  ) {
    const application = await this.getApplicationForUser(id, userId);

    if (dto.company !== undefined) application.company = dto.company.trim();
    if (dto.title !== undefined) application.title = dto.title.trim();
    if (dto.jobId !== undefined) application.jobId = dto.jobId || null;
    if (dto.analysisId !== undefined) {
      application.analysisId = dto.analysisId?.trim() || null;
    }
    if (dto.baselineId !== undefined) {
      application.baselineId = dto.baselineId?.trim() || null;
    }
    if (dto.baselineVersionId !== undefined) {
      application.baselineVersionId = dto.baselineVersionId?.trim() || null;
    }
    if (dto.applicationStatus !== undefined) {
      application.status = dto.applicationStatus ?? ApplicationTrackerStatus.PREPARED;
      if (application.status === ApplicationTrackerStatus.APPLIED) {
        application.appliedAt = application.appliedAt ?? new Date();
      }
    }
    if (dto.appliedDate !== undefined) {
      application.appliedDate = dto.appliedDate
        ? new Date(dto.appliedDate)
        : null;
      if (dto.appliedDate) {
        application.appliedAt = new Date(dto.appliedDate);
      }
    }
    if (dto.fitScore !== undefined) application.fitScore = dto.fitScore;
    if (dto.stage !== undefined) {
      application.stage = dto.stage;
      if (dto.stage === ApplicationStage.APPLIED) {
        application.status = ApplicationTrackerStatus.APPLIED;
        application.appliedAt = application.appliedAt ?? new Date();
      }
    }
    if (dto.notes !== undefined) application.notes = dto.notes?.trim() || null;
    if (dto.sourceUrl !== undefined) {
      application.sourceUrl = this.normalizeUrl(dto.sourceUrl);
      application.jobUrl = this.normalizeUrl(dto.externalApplicationUrl ?? dto.sourceUrl);
    }
    if (dto.externalApplicationUrl !== undefined) {
      application.jobUrl = this.normalizeUrl(dto.externalApplicationUrl);
    }
    if (dto.verificationCoverageSnapshot !== undefined) {
      application.verificationCoverageSnapshot =
        this.normalizeVerificationCoverageSnapshot(dto.verificationCoverageSnapshot);
    }
    if (dto.outcomeLinkageSnapshot !== undefined) {
      application.outcomeLinkageSnapshot = this.normalizeOutcomeLinkageSnapshot(
        dto.outcomeLinkageSnapshot,
      );
    }

    application.lastTouchedAt = new Date();

    return this.applicationRepository.save(application);
  }

  async deleteApplication(id: string, userId: string) {
    const application = await this.getApplicationForUser(id, userId);

    await this.applicationRepository.remove(application);

    return { deleted: true, id };
  }

  async exportApplicationsToCsv(userId: string) {
    const applications = await this.applicationRepository.find({
      where: { userId },
      order: { lastTouchedAt: 'DESC' },
    });

    const escapeCsv = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }

      return value;
    };

    const headers = [
      'company',
      'title',
      'appliedDate',
      'fitScore',
      'stage',
      'notes',
      'sourceUrl',
    ];

    const rows = applications.map((application) => [
      application.company ?? '',
      application.title ?? '',
      application.appliedDate ? application.appliedDate.toISOString() : '',
      application.fitScore ?? '',
      application.stage ?? '',
      application.notes ?? '',
      application.sourceUrl ?? '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((value) => escapeCsv(String(value))).join(','),
      ),
    ].join('\n');

    const baselineVersion = new BaselineVersion();
    baselineVersion.fileHash = 'applications_export';

    const compliance = await this.complianceService.validateAndAudit({
      action: ComplianceAction.APPLICATION_EXPORT,
      actorId: userId,
      baselineVersion,
      outputHash: createHash('sha256').update(csv).digest('hex'),
    });

    return {
      csv,
      auditId: compliance.audit.id,
      baselineVersionHash: compliance.audit.baselineVersionHash,
    };
  }

  async upsertPreparedFromResumeGeneration(
    input: ResumeGenerationTrackerInput,
    syntheticMetadata?: SyntheticMetadataInput,
  ) {
    const fingerprint = this.computeFingerprint(input);
    const now = new Date();
    const artifactRecord = this.buildArtifactRecord(input);

    const entry = await this.applicationRepository.findOne({
      where: { userId: input.userId, fingerprint },
    });

    if (entry) {
      const wasApplied = entry.status === ApplicationTrackerStatus.APPLIED;
      if (!wasApplied && input.cxFitScoreSnapshot) {
        entry.cxFitScoreSnapshot = input.cxFitScoreSnapshot;
        entry.fitScore = input.cxFitScoreSnapshot.overallScore ?? null;
      }
      if (!wasApplied) {
        entry.status = ApplicationTrackerStatus.READY;
      }
      entry.jobId = input.jobId ?? entry.jobId;
      if (input.companyName?.trim()) {
        entry.company = input.companyName.trim();
      }
      if (input.roleTitle?.trim()) {
        entry.title = input.roleTitle.trim();
      }
      if (input.jobUrl?.trim()) {
        entry.jobUrl = input.jobUrl.trim();
        entry.sourceUrl = input.jobUrl.trim();
      }
      entry.baselineVersionId =
        input.baselineVersionId ?? entry.baselineVersionId;
      entry.baselineId = input.baselineId ?? entry.baselineId;
      entry.analysisId = input.analysisId ?? entry.analysisId;
      if (input.verificationCoverageSnapshot) {
        entry.verificationCoverageSnapshot = input.verificationCoverageSnapshot;
      }
      if (input.outcomeLinkageSnapshot) {
        entry.outcomeLinkageSnapshot = input.outcomeLinkageSnapshot;
      }
      if (syntheticMetadata?.isSynthetic) {
        applySyntheticMetadata(entry, syntheticMetadata);
      }
      entry.lastTouchedAt = now;
      entry.resumeArtifacts = this.mergeArtifacts(
        entry.resumeArtifacts,
        artifactRecord,
      );
      return this.applicationRepository.save(entry);
    }

    const companyName =
      input.companyName?.trim() ||
      input.roleTitle?.trim() ||
      'Unknown company';
    const roleTitle =
      input.roleTitle?.trim() ||
      input.companyName?.trim() ||
      'Untitled role';

    const newEntry = this.applicationRepository.create({
      userId: input.userId,
      jobId: input.jobId ?? null,
      company: companyName,
      title: roleTitle,
      jobUrl: input.jobUrl?.trim() || null,
      fingerprint,
      status: ApplicationTrackerStatus.READY,
      preparedAt: now,
      appliedAt: null,
      lastTouchedAt: now,
      baselineVersionId: input.baselineVersionId ?? null,
      baselineId: input.baselineId ?? null,
      analysisId: input.analysisId ?? null,
      appliedDate: null,
      fitScore: input.cxFitScoreSnapshot?.overallScore ?? null,
      stage: ApplicationStage.SAVED,
      notes: null,
      sourceUrl: input.jobUrl?.trim() || null,
      cxFitScoreSnapshot: input.cxFitScoreSnapshot ?? {},
      resumeArtifacts: [artifactRecord],
      verificationCoverageSnapshot: input.verificationCoverageSnapshot ?? {},
      outcomeLinkageSnapshot: input.outcomeLinkageSnapshot ?? {},
    });
    if (syntheticMetadata?.isSynthetic) {
      applySyntheticMetadata(newEntry, syntheticMetadata);
    }

    return this.applicationRepository.save(newEntry);
  }

  async getApplicationForPair(
    userId: string,
    baselineId: string,
    jobId: string,
  ) {
    const normalizedBaselineId = baselineId.trim();
    const normalizedJobId = jobId.trim();
    if (!normalizedBaselineId || !normalizedJobId) {
      throw new BadRequestException('Baseline and job are required.');
    }

    const application = await this.applicationRepository.findOne({
      where: {
        userId,
        baselineId: normalizedBaselineId,
        jobId: normalizedJobId,
      },
    });

    if (application) {
      return application;
    }

    const fingerprint = this.computeFingerprint({
      userId,
      baselineId: normalizedBaselineId,
      jobId: normalizedJobId,
      baselineVersionId: null,
      resumeArtifactId: 'pair-lookup',
    });

    const fallback = await this.applicationRepository.findOne({
      where: { userId, fingerprint },
    });

    if (fallback) {
      return fallback;
    }

    // "No application exists yet" is an expected state before the user generates and saves artifacts.
    return null;
  }

  async upsertApplicationForPair(
    input: PairApplicationUpsertInput,
    syntheticMetadata?: SyntheticMetadataInput,
  ) {
    const normalizedBaselineId = input.baselineId?.trim() || null;
    const normalizedJobId = input.jobId?.trim() || null;
    const fingerprint = this.computeFingerprint({
      userId: input.userId,
      baselineId: normalizedBaselineId,
      jobId: normalizedJobId,
      companyName: input.companyName,
      roleTitle: input.roleTitle,
      jobUrl: input.jobUrl ?? input.sourceUrl ?? input.externalApplicationUrl ?? null,
      jobText: null,
      baselineVersionId: input.baselineVersionId ?? '',
      cxFitScoreSnapshot: input.fitScore
        ? {
            overallScore: input.fitScore,
            verdict: input.fitScore >= 80 ? 'APPLY' : 'CONSIDER',
            dimensionScores: {},
            createdAt: new Date().toISOString(),
          }
        : null,
      resumeArtifactId: input.resumeArtifactId ?? 'pair-upsert',
      resumeArtifactType: input.resumeArtifactType ?? 'resume',
      resumeArtifactFormat: input.resumeArtifactFormat ?? null,
      analysisId: input.analysisId ?? null,
      verificationCoverageSnapshot: input.verificationCoverageSnapshot ?? null,
      outcomeLinkageSnapshot: input.outcomeLinkageSnapshot ?? null,
    });
    const now = new Date();
    const artifactRecord = input.resumeArtifactId
      ? this.buildArtifactRecord({
          userId: input.userId,
          baselineId: normalizedBaselineId,
          jobId: normalizedJobId,
          baselineVersionId: input.baselineVersionId ?? '',
          resumeArtifactId: input.resumeArtifactId,
          resumeArtifactType: input.resumeArtifactType ?? 'resume',
          resumeArtifactFormat: input.resumeArtifactFormat ?? null,
        })
      : null;

    const existing = await this.applicationRepository.findOne({
      where: { userId: input.userId, fingerprint },
    });
    const targetStatus =
      existing?.status === ApplicationTrackerStatus.APPLIED
        ? ApplicationTrackerStatus.APPLIED
        : input.applicationStatus ?? ApplicationTrackerStatus.READY;
    const appliedAt =
      targetStatus === ApplicationTrackerStatus.APPLIED
        ? input.appliedDate
          ? new Date(input.appliedDate)
          : existing?.appliedAt ?? now
        : existing?.appliedAt ?? null;

    if (existing) {
      existing.jobId = normalizedJobId ?? existing.jobId;
      existing.baselineId = normalizedBaselineId ?? existing.baselineId;
      if (input.companyName?.trim()) {
        existing.company = input.companyName.trim();
      }
      if (input.roleTitle?.trim()) {
        existing.title = input.roleTitle.trim();
      }
      const normalizedUrl = this.normalizeUrl(
        input.externalApplicationUrl ?? input.jobUrl ?? input.sourceUrl,
      );
      if (normalizedUrl) {
        existing.jobUrl = normalizedUrl;
        existing.sourceUrl = normalizedUrl;
      }
      if (input.analysisId !== undefined) {
        existing.analysisId = input.analysisId?.trim() || null;
      }
      if (input.baselineVersionId !== undefined) {
        existing.baselineVersionId = input.baselineVersionId?.trim() || null;
      }
      if (input.fitScore !== undefined && existing.status !== ApplicationTrackerStatus.APPLIED) {
        existing.fitScore = input.fitScore;
      }
      if (input.verificationCoverageSnapshot) {
        existing.verificationCoverageSnapshot = input.verificationCoverageSnapshot;
      }
      if (input.outcomeLinkageSnapshot) {
        existing.outcomeLinkageSnapshot = input.outcomeLinkageSnapshot;
      }
      if (artifactRecord) {
        existing.resumeArtifacts = this.mergeArtifacts(existing.resumeArtifacts, artifactRecord);
      }
      if (input.notes !== undefined) {
        existing.notes = input.notes?.trim() || null;
      }
      existing.status = targetStatus;
      existing.appliedAt = appliedAt;
      existing.appliedDate = appliedAt;
      existing.lastTouchedAt = now;
      if (syntheticMetadata?.isSynthetic) {
        applySyntheticMetadata(existing, syntheticMetadata);
      }
      return this.applicationRepository.save(existing);
    }

    const application = this.applicationRepository.create({
      userId: input.userId,
      jobId: normalizedJobId,
      company: input.companyName?.trim() || 'Unknown company',
      title: input.roleTitle?.trim() || 'Untitled role',
      jobUrl: this.normalizeUrl(input.externalApplicationUrl ?? input.jobUrl ?? input.sourceUrl),
      fingerprint,
      status: targetStatus,
      preparedAt: now,
      appliedAt,
      lastTouchedAt: now,
      baselineVersionId: input.baselineVersionId ?? null,
      baselineId: normalizedBaselineId,
      analysisId: input.analysisId ?? null,
      appliedDate: appliedAt,
      fitScore: input.fitScore ?? null,
      stage: targetStatus === ApplicationTrackerStatus.APPLIED ? ApplicationStage.APPLIED : ApplicationStage.SAVED,
      notes: input.notes?.trim() || null,
      sourceUrl: this.normalizeUrl(input.externalApplicationUrl ?? input.jobUrl ?? input.sourceUrl),
      cxFitScoreSnapshot: {},
      resumeArtifacts: artifactRecord ? [artifactRecord] : [],
      verificationCoverageSnapshot: input.verificationCoverageSnapshot ?? {},
      outcomeLinkageSnapshot: input.outcomeLinkageSnapshot ?? {},
    });
    if (syntheticMetadata?.isSynthetic) {
      applySyntheticMetadata(application, syntheticMetadata);
    }
    return this.applicationRepository.save(application);
  }

  private buildManualFingerprint() {
    return `manual:${randomUUID()}`;
  }

  private normalizeFingerprintValue(value?: string | null) {
    if (!value) return '';
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9]/g, '');
  }

  private hashNormalizedValue(value?: string | null) {
    return createHash('sha256')
      .update(this.normalizeFingerprintValue(value))
      .digest('hex');
  }

  private computeFingerprint(input: ResumeGenerationTrackerInput) {
    if (input.baselineId && input.jobId) {
      return `pair:${input.baselineId}:${input.jobId}`;
    }
    if (input.jobId) {
      return `job:${input.jobId}`;
    }

    const normalizedCompany = this.normalizeFingerprintValue(input.companyName);
    const normalizedRole = this.normalizeFingerprintValue(input.roleTitle);
    const canonicalUrl = input.jobUrl?.trim().toLowerCase() ?? '';
    const urlOrText =
      canonicalUrl || this.hashNormalizedValue(input.jobText ?? '');
    const base = `${normalizedCompany}|${normalizedRole}|${urlOrText}`;
    return `role:${createHash('sha256').update(base).digest('hex')}`;
  }

  private normalizeUrl(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private buildArtifactRecord(
    input: ResumeGenerationTrackerInput,
  ): ResumeArtifactRecord {
    return {
      resumeArtifactId: input.resumeArtifactId,
      type: input.resumeArtifactType ?? 'resume',
      createdAt: new Date().toISOString(),
      exportFormat: input.resumeArtifactFormat ?? null,
    };
  }

  private mergeArtifacts(
    existing: ResumeArtifactRecord[],
    incoming: ResumeArtifactRecord,
  ) {
    if (
      existing.some((artifact) => artifact.resumeArtifactId === incoming.resumeArtifactId)
    ) {
      return existing;
    }
    return [...existing, incoming];
  }

  async buildInsightsForUser(userId: string): Promise<ApplicationInsight[]> {
    const applications = await this.applicationRepository.find({
      where: { userId },
      order: { lastTouchedAt: 'DESC' },
      take: 100,
    });

    const insights: ApplicationInsight[] = [];
    const interviewingOrBetter = new Set([
      ApplicationStage.INTERVIEWING,
      ApplicationStage.OFFER,
    ]);

    const withUnverified = applications.filter((application) => {
      const unverified =
        application.verificationCoverageSnapshot?.unverifiedRequirements ?? [];
      return Array.isArray(unverified) && unverified.length > 0;
    });
    const withUnverifiedNoInterviews = withUnverified.filter(
      (application) => !interviewingOrBetter.has(application.stage),
    );
    if (withUnverified.length >= 2 && withUnverifiedNoInterviews.length >= 2) {
      const recurring = this.collectTopRequirement(
        withUnverifiedNoInterviews.flatMap(
          (application) =>
            application.verificationCoverageSnapshot?.unverifiedRequirements ?? [],
        ),
      );
      if (recurring) {
        insights.push({
          type: 'warning',
          message: `You applied to roles where ${recurring} was unverified and did not receive interviews yet.`,
        });
      }
    }

    const fullyVerified = applications.filter((application) => {
      const snapshot = application.verificationCoverageSnapshot ?? {};
      const unverified = Array.isArray(snapshot.unverifiedRequirements)
        ? snapshot.unverifiedRequirements.length
        : 0;
      return unverified === 0;
    });
    const fullyVerifiedWithInterviews = fullyVerified.filter((application) =>
      interviewingOrBetter.has(application.stage),
    );
    if (fullyVerified.length >= 1 && fullyVerifiedWithInterviews.length >= 1) {
      insights.push({
        type: 'success',
        message: 'You received interviews when all core requirements were verified.',
      });
    }

    return insights.slice(0, 3);
  }

  private collectTopRequirement(values: unknown[]) {
    const counts = new Map<string, number>();
    for (const value of values) {
      if (typeof value !== 'string') continue;
      const normalized = value.trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    let winner: string | null = null;
    let max = 0;
    for (const [label, count] of counts.entries()) {
      if (count > max) {
        winner = label;
        max = count;
      }
    }
    return winner;
  }

  private normalizeVerificationCoverageSnapshot(value: unknown): VerificationCoverageSnapshot {
    if (!value || typeof value !== 'object') return {};
    const record = value as Record<string, unknown>;
    const toList = (input: unknown) =>
      Array.isArray(input)
        ? input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    return {
      verifiedRequirements: toList(record.verifiedRequirements),
      inferredRequirements: toList(record.inferredRequirements),
      unverifiedRequirements: toList(record.unverifiedRequirements),
      supportedRequirements: toList(record.supportedRequirements),
    };
  }

  private normalizeOutcomeLinkageSnapshot(value: unknown): OutcomeLinkageSnapshot {
    if (!value || typeof value !== 'object') return {};
    const record = value as Record<string, unknown>;
    const toList = (input: unknown) =>
      Array.isArray(input)
        ? input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    return {
      removedTargeting: toList(record.removedTargeting),
      addedEvidence: toList(record.addedEvidence),
      evidenceAdded: Boolean(record.evidenceAdded),
    };
  }
}
