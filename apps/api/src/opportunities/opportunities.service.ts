import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { computeNextAction, bandPriority, fitBandFromScore, daysSince } from './opportunity-fit';
import { OpportunityActionsNeededService } from './opportunity-actions-needed.service';
import { OpportunityStateMachine } from './opportunity-state-machine';
import { Opportunity, OpportunityStatus } from './opportunity.entity';
import { OpportunityRescoreHandler } from './opportunity-rescore.handler';
import {
  ListOpportunitiesDto,
  type SimpleOpportunityStatus,
} from './dto/list-opportunities.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import { applySyntheticMetadata } from '../synthetic/synthetic-metadata.util';

type CreateOpportunityInput = {
  companyName: string;
  jobTitle: string;
  salary?: string | null;
  fitScore: number;
  baselineVersionUsed?: string | null;
};

type GroupedOpportunities = {
  companyName: string;
  opportunities: Array<
    Opportunity & {
      nextAction: string;
    }
  >;
};

const DORMANT_THRESHOLD_DAYS = 90;
const DORMANT_WARNING_DAYS = 60;

const TERMINAL_STATUSES = new Set<OpportunityStatus>([
  OpportunityStatus.REJECTED,
  OpportunityStatus.WITHDRAWN,
]);

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly stateMachine: OpportunityStateMachine,
    private readonly actionsNeededService: OpportunityActionsNeededService,
    private readonly rescoreHandler: OpportunityRescoreHandler,
  ) {}

  async createFromResumeStudio(
    userId: string,
    input: CreateOpportunityInput,
    syntheticMetadata?: SyntheticMetadataInput,
  ) {
    if (input.fitScore < 70) {
      return null;
    }
    return this.createFromIntent(
      userId,
      input,
      OpportunityStatus.SAVED,
      syntheticMetadata,
    );
  }

  async createFromFitReviewOverride(
    userId: string,
    input: CreateOpportunityInput,
    syntheticMetadata?: SyntheticMetadataInput,
  ) {
    if (input.fitScore >= 70) {
      throw new BadRequestException(
        'Fit Review override is intended for opportunities below 70.',
      );
    }
    return this.createFromIntent(
      userId,
      input,
      OpportunityStatus.IN_FIT_REVIEW,
      syntheticMetadata,
    );
  }

  async listForUser(userId: string, now = new Date()) {
    const opportunities = await this.opportunityRepository.find({
      where: { userId },
    });

    return opportunities
      .map((opportunity) => this.withComputedFields(opportunity, now))
      .sort((left, right) => this.sortOpportunities(left, right));
  }

  async getByIdForUser(id: string, userId: string, now = new Date()) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return this.withComputedFields(opportunity, now);
  }

  async listGroupedByCompany(userId: string, now = new Date()): Promise<GroupedOpportunities[]> {
    const sorted = await this.listForUser(userId, now);
    const grouped = new Map<string, GroupedOpportunities>();

    for (const opportunity of sorted) {
      const key = opportunity.companyName.trim() || 'Unknown company';
      if (!grouped.has(key)) {
        grouped.set(key, { companyName: key, opportunities: [] });
      }
      grouped.get(key)?.opportunities.push(opportunity);
    }

    return Array.from(grouped.values()).sort((left, right) =>
      left.companyName.localeCompare(right.companyName),
    );
  }

  async transitionStatus(
    id: string,
    userId: string,
    nextStatus: OpportunityStatus,
    options?: { manualReset?: boolean; systemDormantTransition?: boolean },
  ) {
    const opportunity = await this.mustFindForUser(id, userId);
    if (nextStatus === OpportunityStatus.APPLIED && opportunity.currentScore < 70) {
      throw new ForbiddenException({
        error: 'INSUFFICIENT_FIT_SCORE',
        message: 'Fit score must be at least 70 to apply.',
      });
    }
    this.stateMachine.assertTransition(opportunity.status, nextStatus, options);

    opportunity.status = nextStatus;
    opportunity.lastStatusChange = new Date();
    opportunity.dormant = nextStatus === OpportunityStatus.DORMANT;

    return this.opportunityRepository.save(opportunity);
  }

  async runDormancySweep(userId?: string, now = new Date()) {
    const opportunities = await this.opportunityRepository.find(
      userId ? { where: { userId } } : undefined,
    );

    let updatedCount = 0;
    for (const opportunity of opportunities) {
      const ageDays = daysSince(opportunity.lastStatusChange, now);
      if (
        ageDays > DORMANT_THRESHOLD_DAYS &&
        !TERMINAL_STATUSES.has(opportunity.status) &&
        opportunity.status !== OpportunityStatus.DORMANT
      ) {
        this.stateMachine.assertTransition(
          opportunity.status,
          OpportunityStatus.DORMANT,
          { systemDormantTransition: true },
        );
        opportunity.status = OpportunityStatus.DORMANT;
        opportunity.dormant = true;
        opportunity.lastStatusChange = now;
        await this.opportunityRepository.save(opportunity);
        updatedCount += 1;
      }
    }

    return { checked: opportunities.length, updatedCount };
  }

  async getActionsNeeded(userId: string, now = new Date()) {
    const opportunities = await this.opportunityRepository.find({
      where: { userId },
    });
    return this.actionsNeededService.generateActionCards(opportunities, now);
  }

  async upsertOpportunity(
    userId: string,
    dto: CreateOpportunityDto,
    syntheticMetadata?: SyntheticMetadataInput,
  ) {
    const companyName = dto.company.trim();
    const jobTitle = dto.roleTitle.trim();
    if (!companyName || !jobTitle) {
      throw new BadRequestException('company and roleTitle are required');
    }

    const normalizedScore = Math.round(dto.score);
    const existing = await this.opportunityRepository.findOne({
      where: { userId, analysisId: dto.analysisId },
      order: { updatedAt: 'DESC' },
    });

    if (existing) {
      existing.jobId = dto.jobId;
      existing.analysisId = dto.analysisId;
      existing.baselineId = dto.baselineId;
      existing.companyName = companyName;
      existing.jobTitle = jobTitle;
      existing.currentScore = normalizedScore;
      existing.currentBand = fitBandFromScore(normalizedScore);
      existing.notes = dto.notes?.trim() || existing.notes || null;
      if (existing.status !== OpportunityStatus.APPLIED && existing.status !== OpportunityStatus.REJECTED) {
        existing.status =
          normalizedScore >= 70 ? OpportunityStatus.SAVED : OpportunityStatus.IN_FIT_REVIEW;
      }
      if (syntheticMetadata?.isSynthetic) {
        applySyntheticMetadata(existing, syntheticMetadata);
      }
      return this.opportunityRepository.save(existing);
    }

    const created = this.opportunityRepository.create({
      userId,
      jobId: dto.jobId,
      savedJobId: dto.jobId,
      analysisId: dto.analysisId,
      baselineId: dto.baselineId,
      savedBaselineId: dto.baselineId,
      companyName,
      jobTitle,
      salary: null,
      status: normalizedScore >= 70 ? OpportunityStatus.SAVED : OpportunityStatus.IN_FIT_REVIEW,
      initialScore: normalizedScore,
      savedFitScore: normalizedScore,
      currentScore: normalizedScore,
      initialBand: fitBandFromScore(normalizedScore),
      currentBand: fitBandFromScore(normalizedScore),
      baselineVersionUsed: null,
      lastStatusChange: new Date(),
      dormant: false,
      notes: dto.notes?.trim() || null,
      savedGenerationCompleted: Boolean(dto.generationCompleted),
      savedEvidenceSummary: this.toSavedEvidenceSummary(dto.savedEvidenceSummary),
    });
    if (syntheticMetadata?.isSynthetic) {
      applySyntheticMetadata(created, syntheticMetadata);
    }

    return this.opportunityRepository.save(created);
  }

  async listSimpleForUser(userId: string, query: ListOpportunitiesDto) {
    const opportunities = await this.opportunityRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });

    const minScore =
      query.minScore !== undefined && query.minScore.trim().length > 0
        ? Number(query.minScore)
        : null;
    const maxScore =
      query.maxScore !== undefined && query.maxScore.trim().length > 0
        ? Number(query.maxScore)
        : null;

    return opportunities
      .map((opportunity) => this.toSimpleOpportunity(opportunity))
      .filter((entry) => {
        if (query.analysisId && entry.analysisId !== query.analysisId) {
          return false;
        }
        if (query.status && entry.status !== query.status) {
          return false;
        }
        if (minScore !== null && !Number.isNaN(minScore) && entry.score < minScore) {
          return false;
        }
        if (maxScore !== null && !Number.isNaN(maxScore) && entry.score > maxScore) {
          return false;
        }
        return true;
      });
  }

  async updateOpportunity(id: string, userId: string, dto: UpdateOpportunityDto) {
    const opportunity = await this.mustFindForUser(id, userId);
    const current = this.toSimpleStatus(opportunity);
    const next = dto.status ?? current;

    if (!this.isSimpleTransitionAllowed(current, next)) {
      throw new BadRequestException(`Invalid status transition: ${current} -> ${next}`);
    }

    opportunity.status = this.fromSimpleStatus(next, opportunity.currentScore);
    if (dto.notes !== undefined) {
      opportunity.notes = dto.notes.trim() || null;
    }
    opportunity.lastStatusChange = new Date();
    return this.opportunityRepository.save(opportunity);
  }

  async exportForUser(userId: string, format: 'csv' | 'json', now = new Date()) {
    const opportunities = await this.listForUser(userId, now);
    if (format === 'json') {
      return JSON.stringify(opportunities, null, 2);
    }
    return this.toCsv(opportunities);
  }

  async runBoundaryRescoreFromOverrides(
    userId: string,
    scoreByOpportunityId: Record<string, number>,
    baselineVersionUsed?: string | null,
  ) {
    return this.rescoreHandler.rescoreNearBoundariesFromOverride(
      userId,
      scoreByOpportunityId,
      baselineVersionUsed,
    );
  }

  private async createFromIntent(
    userId: string,
    input: CreateOpportunityInput,
    status: OpportunityStatus,
    syntheticMetadata?: SyntheticMetadataInput,
  ) {
    const companyName = input.companyName.trim();
    const jobTitle = input.jobTitle.trim();
    if (!companyName) {
      throw new BadRequestException('companyName is required');
    }
    if (!jobTitle) {
      throw new BadRequestException('jobTitle is required');
    }

    const existing = await this.opportunityRepository.findOne({
      where: { userId, companyName, jobTitle },
      order: { dateCreated: 'DESC' },
    });

    if (existing && !TERMINAL_STATUSES.has(existing.status)) {
      return existing;
    }

    const score = Math.round(input.fitScore);
    const band = fitBandFromScore(score);

    const opportunity = this.opportunityRepository.create({
      userId,
      companyName,
      jobTitle,
      salary: input.salary?.trim() || null,
      status,
      initialScore: score,
      savedFitScore: score,
      currentScore: score,
      initialBand: band,
      currentBand: band,
      baselineVersionUsed: input.baselineVersionUsed?.trim() || null,
      lastStatusChange: new Date(),
      dormant: false,
      savedGenerationCompleted: false,
      savedEvidenceSummary: null,
    });
    if (syntheticMetadata?.isSynthetic) {
      applySyntheticMetadata(opportunity, syntheticMetadata);
    }

    return this.opportunityRepository.save(opportunity);
  }

  private async mustFindForUser(id: string, userId: string) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, userId },
    });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return opportunity;
  }

  private withComputedFields(opportunity: Opportunity, now = new Date()) {
    return {
      ...opportunity,
      nextAction: computeNextAction(opportunity.status, opportunity.lastStatusChange, now),
    };
  }

  private sortOpportunities(
    left: Opportunity & { nextAction: string },
    right: Opportunity & { nextAction: string },
  ) {
    const bandDelta = bandPriority(left.currentBand) - bandPriority(right.currentBand);
    if (bandDelta !== 0) {
      return bandDelta;
    }

    if (left.currentScore !== right.currentScore) {
      return right.currentScore - left.currentScore;
    }

    return right.lastStatusChange.getTime() - left.lastStatusChange.getTime();
  }

  private toCsv(opportunities: Array<Opportunity & { nextAction: string }>) {
    const header = [
      'id',
      'company_name',
      'job_title',
      'salary',
      'status',
      'initial_score',
      'current_score',
      'initial_band',
      'current_band',
      'baseline_version_used',
      'dormant',
      'date_created',
      'last_status_change',
      'next_action',
    ];

    const rows = opportunities.map((opportunity) => [
      opportunity.id,
      opportunity.companyName,
      opportunity.jobTitle,
      opportunity.salary ?? '',
      opportunity.status,
      String(opportunity.initialScore),
      String(opportunity.currentScore),
      opportunity.initialBand,
      opportunity.currentBand,
      opportunity.baselineVersionUsed ?? '',
      String(opportunity.dormant),
      opportunity.dateCreated.toISOString(),
      opportunity.lastStatusChange.toISOString(),
      opportunity.nextAction,
    ]);

    return [header.join(','), ...rows.map((row) => row.map(this.escapeCsv).join(','))].join(
      '\n',
    );
  }

  private escapeCsv(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private toSimpleOpportunity(opportunity: Opportunity) {
    return {
      id: opportunity.id,
      userId: opportunity.userId,
      jobId: opportunity.jobId,
      analysisId: opportunity.analysisId,
      baselineId: opportunity.baselineId,
      score: opportunity.currentScore,
      savedFitScore: opportunity.savedFitScore ?? opportunity.initialScore ?? null,
      savedAt: opportunity.dateCreated.toISOString(),
      savedBaselineId: opportunity.savedBaselineId ?? opportunity.baselineId,
      savedJobId: opportunity.savedJobId ?? opportunity.jobId,
      savedGenerationCompleted: Boolean(opportunity.savedGenerationCompleted),
      savedEvidenceSummary: opportunity.savedEvidenceSummary ?? [],
      company: opportunity.companyName,
      roleTitle: opportunity.jobTitle,
      status: this.toSimpleStatus(opportunity),
      notes: opportunity.notes,
      createdAt: opportunity.dateCreated.toISOString(),
      updatedAt: opportunity.updatedAt.toISOString(),
    };
  }

  private toSavedEvidenceSummary(input?: string[] | null) {
    if (!Array.isArray(input)) return null;
    const normalized = input
      .map((entry) => (typeof entry === 'string' ? entry.trim().replace(/\s+/g, ' ') : ''))
      .filter((entry) => entry.length > 0)
      .slice(0, 3);
    return normalized.length ? normalized : null;
  }

  private toSimpleStatus(opportunity: Opportunity): SimpleOpportunityStatus {
    if (opportunity.status === OpportunityStatus.APPLIED) return 'applied';
    if (
      opportunity.status === OpportunityStatus.REJECTED ||
      opportunity.status === OpportunityStatus.WITHDRAWN ||
      opportunity.status === OpportunityStatus.DORMANT
    ) {
      return 'passed';
    }
    if (opportunity.status === OpportunityStatus.IN_FIT_REVIEW) {
      return 'improving_fit';
    }
    if (opportunity.status === OpportunityStatus.SAVED && opportunity.currentScore < 70) {
      return 'improving_fit';
    }
    if (opportunity.status === OpportunityStatus.SAVED) {
      return 'ready_to_apply';
    }
    return 'saved';
  }

  private fromSimpleStatus(
    status: SimpleOpportunityStatus,
    score: number,
  ): OpportunityStatus {
    if (status === 'applied') return OpportunityStatus.APPLIED;
    if (status === 'passed') return OpportunityStatus.REJECTED;
    if (status === 'improving_fit') return OpportunityStatus.IN_FIT_REVIEW;
    if (status === 'ready_to_apply') return OpportunityStatus.SAVED;
    return score >= 70 ? OpportunityStatus.SAVED : OpportunityStatus.IN_FIT_REVIEW;
  }

  private isSimpleTransitionAllowed(
    current: SimpleOpportunityStatus,
    next: SimpleOpportunityStatus,
  ) {
    if (current === next) return true;
    if (next === 'passed') return true;
    if (current === 'ready_to_apply' && next === 'applied') return true;
    if (current === 'improving_fit' && next === 'ready_to_apply') return true;
    return false;
  }
}

export const OPPORTUNITY_DORMANT_WARNING_DAYS = DORMANT_WARNING_DAYS;
export const OPPORTUNITY_DORMANT_THRESHOLD_DAYS = DORMANT_THRESHOLD_DAYS;

