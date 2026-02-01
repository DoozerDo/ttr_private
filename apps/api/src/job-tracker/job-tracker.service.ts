import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ComplianceAction } from '../compliance/compliance.types';
import { ComplianceService } from '../compliance/compliance.service';
import { CreateJobTrackerEntryDto } from './dto/create-job-tracker-entry.dto';
import { UpdateJobTrackerEntryDto } from './dto/update-job-tracker-entry.dto';
import { JobTrackerEntry } from './job-tracker-entry.entity';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';

const CANONICAL_STAGE_VALUES = ['Applied', 'Interviewing', 'Offer', 'Closed'] as const;
type CanonicalStageValue = (typeof CANONICAL_STAGE_VALUES)[number];

// Legacy stage values remain stored for backward compatibility but should export with canonical labels.
const LEGACY_STAGE_TO_CANONICAL_STAGE: Record<string, CanonicalStageValue> = {
  Prospecting: 'Applied',
  Rejected: 'Closed',
  Archived: 'Closed',
} as const;

function canonicalStageValue(stage?: string | null): CanonicalStageValue | null {
  if (!stage) return null;
  const trimmed = stage.trim();
  if (CANONICAL_STAGE_VALUES.includes(trimmed as CanonicalStageValue)) {
    return trimmed as CanonicalStageValue;
  }
  return LEGACY_STAGE_TO_CANONICAL_STAGE[
    trimmed as keyof typeof LEGACY_STAGE_TO_CANONICAL_STAGE
  ] ?? null;
}

function canonicalStageLabel(stage?: string | null): string {
  if (!stage) return '';
  const canonical = canonicalStageValue(stage);
  return canonical ?? stage.trim();
}

@Injectable()
export class JobTrackerService {
  constructor(
    @InjectRepository(JobTrackerEntry)
    private readonly jobTrackerRepository: Repository<JobTrackerEntry>,
    private readonly complianceService: ComplianceService,
  ) {}

  async listEntriesForUser(userId: string) {
    return this.jobTrackerRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getEntryForUser(id: string, userId: string) {
    const entry = await this.jobTrackerRepository.findOne({
      where: { id, userId },
    });

    if (!entry) {
      throw new NotFoundException('Job tracker entry not found');
    }

    return entry;
  }

  async createEntry(userId: string, dto: CreateJobTrackerEntryDto) {
    const entry = this.jobTrackerRepository.create({
      userId,
      company: dto.company.trim(),
      roleTitle: dto.roleTitle.trim(),
      stage: dto.stage.trim(),
      cxFitScore: dto.cxFitScore,
      dateApplied: new Date(dto.dateApplied),
      notes: dto.notes?.trim() || null,
      sourceUrl: dto.sourceUrl?.trim() || null,
    });

    const savedEntry = await this.jobTrackerRepository.save(entry);
    await this.recordAudit(userId, ComplianceAction.JOB_TRACKER_CREATE, {
      entryId: savedEntry.id,
      company: savedEntry.company,
      roleTitle: savedEntry.roleTitle,
    });

    return savedEntry;
  }

  async updateEntry(
    id: string,
    userId: string,
    dto: UpdateJobTrackerEntryDto,
  ) {
    const entry = await this.getEntryForUser(id, userId);

    if (dto.company !== undefined) {
      entry.company = dto.company.trim();
    }

    if (dto.roleTitle !== undefined) {
      entry.roleTitle = dto.roleTitle.trim();
    }

    if (dto.stage !== undefined) {
      entry.stage = dto.stage.trim();
    }

    if (dto.cxFitScore !== undefined) {
      entry.cxFitScore = dto.cxFitScore;
    }

    if (dto.dateApplied !== undefined) {
      entry.dateApplied = new Date(dto.dateApplied);
    }

    if (dto.notes !== undefined) {
      entry.notes = dto.notes.trim() || null;
    }

    if (dto.sourceUrl !== undefined) {
      entry.sourceUrl = dto.sourceUrl.trim() || null;
    }

    const updatedEntry = await this.jobTrackerRepository.save(entry);
    await this.recordAudit(userId, ComplianceAction.JOB_TRACKER_UPDATE, {
      entryId: updatedEntry.id,
    });

    return updatedEntry;
  }

  async deleteEntry(id: string, userId: string) {
    const entry = await this.getEntryForUser(id, userId);
    await this.jobTrackerRepository.delete({ id: entry.id, userId });
    await this.recordAudit(userId, ComplianceAction.JOB_TRACKER_DELETE, {
      entryId: entry.id,
    });
    return { success: true };
  }

  async exportEntries(userId: string) {
    const entries = await this.listEntriesForUser(userId);
    const csv = this.buildCsv(entries);
    const auditEntry = await this.recordAudit(
      userId,
      ComplianceAction.JOB_TRACKER_EXPORT,
      { count: entries.length },
    );

    return {
      csv,
      auditId: auditEntry.id,
    };
  }

  private buildCsv(entries: JobTrackerEntry[]) {
    const rows = entries.map((entry) => [
      this.csvEscape(entry.id),
      this.csvEscape(entry.company),
      this.csvEscape(entry.roleTitle),
      this.csvEscape(canonicalStageLabel(entry.stage)),
      this.csvEscape(this.formatDate(entry.dateApplied)),
      this.csvEscape(entry.cxFitScore.toString()),
      this.csvEscape(entry.sourceUrl ?? ''),
      this.csvEscape(entry.notes ?? ''),
      this.csvEscape(entry.createdAt.toISOString()),
      this.csvEscape(entry.updatedAt.toISOString()),
    ]);

    const header = [
      'id',
      'company',
      'roleTitle',
      'stage',
      'dateApplied',
      'cxFitScore',
      'sourceUrl',
      'notes',
      'createdAt',
      'updatedAt',
    ];

    return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  private csvEscape(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private formatDate(value: Date | null) {
    if (!value) {
      return '';
    }

    return value.toISOString().split('T')[0];
  }

  private async recordAudit(
    actorId: string,
    action: ComplianceAction,
    payload: Record<string, unknown>,
  ) {
    const normalized = JSON.stringify(payload ?? {});
    const outputHash = createHash('sha256').update(normalized).digest('hex');
    const compliance = await this.complianceService.validateAndAudit({
      action,
      actorId,
      outputHash,
    });

    return compliance.audit;
  }
}
