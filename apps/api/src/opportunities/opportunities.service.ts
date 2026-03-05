import {
  BadRequestException,
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

  async createFromResumeStudio(userId: string, input: CreateOpportunityInput) {
    if (input.fitScore < 70) {
      return null;
    }
    return this.createFromIntent(userId, input, OpportunityStatus.SAVED);
  }

  async createFromFitReviewOverride(userId: string, input: CreateOpportunityInput) {
    if (input.fitScore >= 70) {
      throw new BadRequestException(
        'Fit Review override is intended for opportunities below 70.',
      );
    }
    return this.createFromIntent(userId, input, OpportunityStatus.IN_FIT_REVIEW);
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
      currentScore: score,
      initialBand: band,
      currentBand: band,
      baselineVersionUsed: input.baselineVersionUsed?.trim() || null,
      lastStatusChange: new Date(),
      dormant: false,
    });

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
}

export const OPPORTUNITY_DORMANT_WARNING_DAYS = DORMANT_WARNING_DAYS;
export const OPPORTUNITY_DORMANT_THRESHOLD_DAYS = DORMANT_THRESHOLD_DAYS;

