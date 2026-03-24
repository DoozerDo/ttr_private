import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThan, Repository } from 'typeorm';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { ExpandedFitAssessment } from '../analysis/expanded-fit-assessment.entity';
import { Application } from '../applications/application.entity';
import { BetaFeedback } from '../beta-feedback/beta-feedback.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Baseline } from '../baseline/baseline.entity';
import { CoverLetter } from '../cover-letters/cover-letter.entity';
import { Interview } from '../interviews/interview.entity';
import { JobTrackerEntry } from '../job-tracker/job-tracker-entry.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { User } from '../users/user.entity';
import { SyntheticCleanupRun } from './synthetic-cleanup-run.entity';
import { SyntheticConfigService } from './synthetic-config.service';

export type CleanupTriggerSource = 'cron' | 'manual' | 'system';

export type CleanupRunInput = {
  dryRun?: boolean;
  triggerSource?: CleanupTriggerSource;
  scenarioKey?: string | null;
  syntheticRunId?: string | null;
};

export type SyntheticEntityCounts = Record<string, number>;

export type CleanupRunResult = {
  dryRun: boolean;
  cutoff: string;
  failedCutoff: string;
  logCutoff: string;
  countsByEntity: SyntheticEntityCounts;
  deletedTotal: number;
};

@Injectable()
export class SyntheticCleanupService {
  private readonly logger = new Logger(SyntheticCleanupService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(SyntheticCleanupRun)
    private readonly cleanupRunRepository: Repository<SyntheticCleanupRun>,
    private readonly syntheticConfigService: SyntheticConfigService,
  ) {}

  getCleanupConfig() {
    return this.syntheticConfigService.cleanupConfig;
  }

  async listRecentRuns(limit = 25): Promise<SyntheticCleanupRun[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    return this.cleanupRunRepository.find({
      order: { startedAt: 'DESC' },
      take: boundedLimit,
    });
  }

  async getSyntheticDataSummary(): Promise<SyntheticEntityCounts> {
    const manager = this.dataSource.manager;
    const map: Array<[string, number]> = await Promise.all([
      this.countSynthetic(manager, User, 'users'),
      this.countSynthetic(manager, Baseline, 'baselines'),
      this.countSynthetic(manager, FitAssessment, 'fit_assessments'),
      this.countSynthetic(manager, ExpandedFitAssessment, 'expanded_fit_assessments'),
      this.countSynthetic(manager, Interview, 'interviews'),
      this.countSynthetic(manager, Opportunity, 'opportunities'),
      this.countSynthetic(manager, Application, 'applications'),
      this.countSynthetic(manager, CoverLetter, 'cover_letters'),
      this.countSynthetic(manager, JobTrackerEntry, 'job_tracker_entries'),
      this.countSynthetic(manager, BetaFeedback, 'beta_feedback'),
    ]);

    return Object.fromEntries(map);
  }

  async runCleanup(input: CleanupRunInput = {}): Promise<CleanupRunResult> {
    const config = this.syntheticConfigService.cleanupConfig;
    const startedAt = new Date();
    const dryRun = input.dryRun ?? config.dryRunDefault;
    const triggerSource = input.triggerSource ?? 'system';

    const run = await this.cleanupRunRepository.save(
      this.cleanupRunRepository.create({
        runType: 'cleanup',
        scenarioKey: input.scenarioKey ?? null,
        syntheticRunId: input.syntheticRunId ?? null,
        triggerSource,
        status: 'started',
        summaryJson: {
          dryRun,
        },
        stepResultsJson: [],
      }),
    );

    const now = new Date();
    const cutoff = new Date(now.getTime() - config.retentionHours * 60 * 60 * 1000);
    const failedCutoff = new Date(
      now.getTime() - config.failedRetentionHours * 60 * 60 * 1000,
    );
    const logCutoff = new Date(now.getTime() - config.logRetentionDays * 24 * 60 * 60 * 1000);

    try {
      const countsByEntity = dryRun
        ? await this.computeEligibleCounts(cutoff, failedCutoff)
        : await this.executeCleanup(cutoff, failedCutoff);

      if (!dryRun) {
        await this.cleanupRunRepository.delete({
          runType: 'cleanup',
          startedAt: LessThan(logCutoff),
        });
      }

      const deletedTotal = Object.values(countsByEntity).reduce((sum, value) => sum + value, 0);
      const finishedAt = new Date();
      const status = dryRun ? 'dry_run' : 'succeeded';

      await this.cleanupRunRepository.update(run.id, {
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summaryJson: {
          dryRun,
          cutoff: cutoff.toISOString(),
          failedCutoff: failedCutoff.toISOString(),
          logCutoff: logCutoff.toISOString(),
          countsByEntity,
          deletedTotal,
        },
        stepResultsJson: [],
      });

      return {
        dryRun,
        cutoff: cutoff.toISOString(),
        failedCutoff: failedCutoff.toISOString(),
        logCutoff: logCutoff.toISOString(),
        countsByEntity,
        deletedTotal,
      };
    } catch (error) {
      const finishedAt = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown cleanup failure';

      await this.cleanupRunRepository.update(run.id, {
        status: 'failed',
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        summaryJson: {
          dryRun,
          cutoff: cutoff.toISOString(),
          failedCutoff: failedCutoff.toISOString(),
          logCutoff: logCutoff.toISOString(),
        },
        stepResultsJson: [],
        errorMessage,
      });

      this.logger.error(`Synthetic cleanup failed: ${errorMessage}`);
      throw error;
    }
  }

  private async computeEligibleCounts(
    cutoff: Date,
    failedCutoff: Date,
  ): Promise<SyntheticEntityCounts> {
    return this.dataSource.transaction(async (manager) =>
      this.collectCountsForManager(manager, cutoff, failedCutoff),
    );
  }

  private async executeCleanup(
    cutoff: Date,
    failedCutoff: Date,
  ): Promise<SyntheticEntityCounts> {
    return this.dataSource.transaction(async (manager) => {
      const ids = await this.resolveEligibleIds(manager, cutoff, failedCutoff);
      const counts: SyntheticEntityCounts = {};

      counts.baseline_parsed = await this.deleteByIds(manager, BaselineParsed, ids.baselineParsedIds, 'id');
      counts.baseline_sections = await this.deleteByIds(manager, BaselineSection, ids.baselineSectionIds, 'id');
      counts.baseline_versions = await this.deleteByIds(manager, BaselineVersion, ids.baselineVersionIds, 'id');

      counts.expanded_fit_assessments = await this.deleteByIds(manager, ExpandedFitAssessment, ids.expandedFitAssessmentIds, 'id');
      counts.fit_assessments = await this.deleteByIds(manager, FitAssessment, ids.fitAssessmentIds, 'id');
      counts.interviews = await this.deleteByIds(manager, Interview, ids.interviewIds, 'id');
      counts.cover_letters = await this.deleteByIds(manager, CoverLetter, ids.coverLetterIds, 'id');
      counts.applications = await this.deleteByIds(manager, Application, ids.applicationIds, 'id');
      counts.opportunities = await this.deleteByIds(manager, Opportunity, ids.opportunityIds, 'id');
      counts.job_tracker_entries = await this.deleteByIds(manager, JobTrackerEntry, ids.jobTrackerEntryIds, 'id');
      counts.beta_feedback = await this.deleteByIds(manager, BetaFeedback, ids.betaFeedbackIds, 'id');
      counts.baselines = await this.deleteByIds(manager, Baseline, ids.baselineIds, 'id');
      counts.users = await this.deleteByIds(manager, User, ids.userIds, 'id');

      return counts;
    });
  }

  private async collectCountsForManager(
    manager: EntityManager,
    cutoff: Date,
    failedCutoff: Date,
  ): Promise<SyntheticEntityCounts> {
    const ids = await this.resolveEligibleIds(manager, cutoff, failedCutoff);

    return {
      baseline_parsed: ids.baselineParsedIds.length,
      baseline_sections: ids.baselineSectionIds.length,
      baseline_versions: ids.baselineVersionIds.length,
      expanded_fit_assessments: ids.expandedFitAssessmentIds.length,
      fit_assessments: ids.fitAssessmentIds.length,
      interviews: ids.interviewIds.length,
      cover_letters: ids.coverLetterIds.length,
      applications: ids.applicationIds.length,
      opportunities: ids.opportunityIds.length,
      job_tracker_entries: ids.jobTrackerEntryIds.length,
      beta_feedback: ids.betaFeedbackIds.length,
      baselines: ids.baselineIds.length,
      users: ids.userIds.length,
    };
  }

  private async resolveEligibleIds(
    manager: EntityManager,
    cutoff: Date,
    failedCutoff: Date,
  ) {
    const baselineRows = await manager
      .createQueryBuilder(Baseline, 'baseline')
      .select(['baseline.id AS id'])
      .where('baseline."isSynthetic" = true')
      .andWhere('baseline."preserveFromCleanup" = false')
      .andWhere(
        '(COALESCE(baseline."syntheticCreatedAt", baseline."createdAt") <= :cutoff OR (baseline."syntheticScenarioKey" ILIKE :failedKey AND COALESCE(baseline."syntheticCreatedAt", baseline."createdAt") <= :failedCutoff))',
        {
          cutoff,
          failedCutoff,
          failedKey: '%failed%',
        },
      )
      .getRawMany<{ id: string }>();
    const baselineIds = baselineRows.map((row) => row.id);

    const baselineVersionIds = baselineIds.length
      ? (
          await manager.find(BaselineVersion, {
            where: { baselineId: In(baselineIds) },
            select: ['id'],
          })
        ).map((row) => row.id)
      : [];

    const baselineSectionIds = baselineIds.length
      ? (
          await manager.find(BaselineSection, {
            where: { baselineId: In(baselineIds) },
            select: ['id'],
          })
        ).map((row) => row.id)
      : [];

    const baselineParsedIds = baselineIds.length
      ? (
          await manager.find(BaselineParsed, {
            where: { baselineId: In(baselineIds) },
            select: ['id'],
          })
        ).map((row) => row.id)
      : [];

    const [fitAssessmentIds, expandedFitAssessmentIds, interviewIds, opportunityIds, applicationIds, coverLetterIds, jobTrackerEntryIds, betaFeedbackIds, userIds] = await Promise.all([
      this.findDirectSyntheticIds(manager, FitAssessment, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, ExpandedFitAssessment, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, Interview, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, Opportunity, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, Application, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, CoverLetter, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, JobTrackerEntry, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, BetaFeedback, cutoff, failedCutoff),
      this.findDirectSyntheticIds(manager, User, cutoff, failedCutoff),
    ]);

    return {
      baselineIds,
      baselineVersionIds,
      baselineSectionIds,
      baselineParsedIds,
      fitAssessmentIds,
      expandedFitAssessmentIds,
      interviewIds,
      opportunityIds,
      applicationIds,
      coverLetterIds,
      jobTrackerEntryIds,
      betaFeedbackIds,
      userIds,
    };
  }

  private async findDirectSyntheticIds<T extends { id: string }>(
    manager: EntityManager,
    entity: new () => T,
    cutoff: Date,
    failedCutoff: Date,
  ): Promise<string[]> {
    const rows = await manager
      .createQueryBuilder(entity, 'row')
      .select(['row.id AS id'])
      .where('row."isSynthetic" = true')
      .andWhere('row."preserveFromCleanup" = false')
      .andWhere(
        '(COALESCE(row."syntheticCreatedAt", row."createdAt") <= :cutoff OR (row."syntheticScenarioKey" ILIKE :failedKey AND COALESCE(row."syntheticCreatedAt", row."createdAt") <= :failedCutoff) OR (row."syntheticScenarioKey" ILIKE :partialKey AND COALESCE(row."syntheticCreatedAt", row."createdAt") <= :failedCutoff))',
        {
          cutoff,
          failedCutoff,
          failedKey: '%failed%',
          partialKey: '%partial%',
        },
      )
      .getRawMany<{ id: string }>();

    return rows.map((row) => row.id);
  }

  private async countSynthetic<T>(
    manager: EntityManager,
    entity: new () => T,
    key: string,
  ): Promise<[string, number]> {
    const qb = manager.createQueryBuilder(entity, 'row');
    const count = await qb
      .where('row."isSynthetic" = true')
      .andWhere('row."preserveFromCleanup" = false')
      .getCount();
    return [key, count];
  }

  private async deleteByIds<T>(
    manager: EntityManager,
    entity: new () => T,
    ids: string[],
    key: string,
  ): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await manager
      .createQueryBuilder()
      .delete()
      .from(entity)
      .where(`"${key}" IN (:...ids)`, { ids })
      .execute();
    return result.affected ?? 0;
  }
}
