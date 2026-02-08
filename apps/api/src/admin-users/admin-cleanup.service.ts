import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, ObjectLiteral } from 'typeorm';

import { AdminUser } from './admin-user.entity';
import { Application } from '../applications/application.entity';
import { ExpandedFitAssessment } from '../analysis/expanded-fit-assessment.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Baseline, BaselineStatus } from '../baseline/baseline.entity';
import { ComplianceAudit } from '../compliance/compliance-audit.entity';
import { CoverLetter } from '../cover-letters/cover-letter.entity';
import { InterviewSession } from '../interviews/interview-session.entity';
import { Interview } from '../interviews/interview.entity';
import { JobTrackerEntry } from '../job-tracker/job-tracker-entry.entity';
import { Job } from '../jobs/job.entity';
import { RealityCheck } from '../reality-check/reality-check.entity';
import { StarStory } from '../star-stories/star-story.entity';
import { User } from '../users/user.entity';

type CleanupResult = {
  deleted: true;
  id: string;
  category: 'user' | 'job' | 'baseline';
  counts: Record<string, number>;
};

@Injectable()
export class AdminCleanupService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listJobs(includeArchived: boolean) {
    const query = this.dataSource
      .createQueryBuilder(Job, 'job')
      .leftJoin(User, 'user', 'CAST(user.id AS text) = job.userId')
      .select([
        'job.id AS id',
        'job.title AS title',
        'job.userId AS "userId"',
        'job.createdAt AS "createdAt"',
        'job.isArchived AS "isArchived"',
        'user.email AS "userEmail"',
      ])
      .orderBy('job.createdAt', 'DESC');

    if (!includeArchived) {
      query.where('job.isArchived = :isArchived', { isArchived: false });
    }

    return query.getRawMany();
  }

  async listBaselines(includeArchived: boolean) {
    const query = this.dataSource
      .createQueryBuilder(Baseline, 'baseline')
      .leftJoin(User, 'user', 'CAST(user.id AS text) = baseline.userId')
      .select([
        'baseline.id AS id',
        'baseline.originalFilename AS "originalFilename"',
        'baseline.status AS status',
        'baseline.updatedAt AS "updatedAt"',
        'baseline.userId AS "userId"',
        'user.email AS "userEmail"',
      ])
      .orderBy('baseline.updatedAt', 'DESC');

    if (!includeArchived) {
      query.where('baseline.status = :status', { status: BaselineStatus.ACTIVE });
    }

    return query.getRawMany();
  }

  async deleteUser(userId: string): Promise<CleanupResult> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const jobIds = (
        await manager.find(Job, { where: { userId }, select: ['id'] })
      ).map((record) => record.id);
      const baselineIds = (
        await manager.find(Baseline, { where: { userId }, select: ['id'] })
      ).map((record) => record.id);

      const counts: Record<string, number> = {};

      if (jobIds.length > 0) {
        await this.deleteByJobIds(manager, jobIds, counts);
      }

      if (baselineIds.length > 0) {
        await this.deleteByBaselineIds(manager, baselineIds, counts);
      }

      await this.deleteWhere(manager, Application, { userId }, counts, 'applications');
      await this.deleteWhere(manager, CoverLetter, { userId }, counts, 'cover_letters_user');
      await this.deleteWhere(manager, InterviewSession, { userId }, counts, 'interview_sessions_user');
      await this.deleteWhere(manager, Interview, { userId }, counts, 'interviews_user');
      await this.deleteWhere(manager, FitAssessment, { userId }, counts, 'fit_assessments_user');
      await this.deleteWhere(manager, ExpandedFitAssessment, { userId }, counts, 'expanded_fit_assessments_user');
      await this.deleteWhere(manager, StarStory, { userId }, counts, 'star_stories');
      await this.deleteWhere(manager, JobTrackerEntry, { userId }, counts, 'job_tracker_entries');
      await this.deleteWhere(manager, ComplianceAudit, { actorId: userId }, counts, 'compliance_audits_actor');
      await this.deleteWhere(manager, AdminUser, { userId }, counts, 'admin_users');
      await this.deleteWhere(manager, Baseline, { userId }, counts, 'baselines_user');
      await this.deleteWhere(manager, Job, { userId }, counts, 'jobs_user');
      await this.deleteWhere(manager, User, { id: userId }, counts, 'users');

      return { deleted: true, id: userId, category: 'user', counts };
    });
  }

  async deleteJob(jobId: string): Promise<CleanupResult> {
    return this.dataSource.transaction(async (manager) => {
      const job = await manager.findOne(Job, { where: { id: jobId } });
      if (!job) {
        throw new NotFoundException('Job not found');
      }

      const counts: Record<string, number> = {};
      await this.deleteByJobIds(manager, [jobId], counts);
      await this.deleteWhere(manager, Job, { id: jobId }, counts, 'jobs');

      return { deleted: true, id: jobId, category: 'job', counts };
    });
  }

  async deleteBaseline(baselineId: string): Promise<CleanupResult> {
    return this.dataSource.transaction(async (manager) => {
      const baseline = await manager.findOne(Baseline, { where: { id: baselineId } });
      if (!baseline) {
        throw new NotFoundException('Baseline not found');
      }

      const counts: Record<string, number> = {};
      await this.deleteByBaselineIds(manager, [baselineId], counts);
      await this.deleteWhere(manager, Baseline, { id: baselineId }, counts, 'baselines');

      return { deleted: true, id: baselineId, category: 'baseline', counts };
    });
  }

  private async deleteByJobIds(
    manager: EntityManager,
    jobIds: string[],
    counts: Record<string, number>,
  ) {
    const where = { jobId: In(jobIds) };
    await this.deleteWhere(manager, Application, where, counts, 'applications_job');
    await this.deleteWhere(manager, CoverLetter, where, counts, 'cover_letters_job');
    await this.deleteWhere(manager, InterviewSession, where, counts, 'interview_sessions_job');
    await this.deleteWhere(manager, Interview, where, counts, 'interviews_job');
    await this.deleteWhere(manager, FitAssessment, where, counts, 'fit_assessments_job');
    await this.deleteWhere(manager, ExpandedFitAssessment, where, counts, 'expanded_fit_assessments_job');
    await this.deleteWhere(manager, RealityCheck, where, counts, 'reality_checks_job');
    await this.deleteWhere(manager, ComplianceAudit, where, counts, 'compliance_audits_job');
  }

  private async deleteByBaselineIds(
    manager: EntityManager,
    baselineIds: string[],
    counts: Record<string, number>,
  ) {
    const baselineVersions = await manager.find(BaselineVersion, {
      where: { baselineId: In(baselineIds) },
      select: ['id'],
    });
    const baselineVersionIds = baselineVersions.map((record) => record.id);

    const where = { baselineId: In(baselineIds) };
    await this.deleteWhere(manager, CoverLetter, where, counts, 'cover_letters_baseline');
    await this.deleteWhere(manager, InterviewSession, where, counts, 'interview_sessions_baseline');
    await this.deleteWhere(manager, Interview, where, counts, 'interviews_baseline');
    await this.deleteWhere(manager, FitAssessment, where, counts, 'fit_assessments_baseline');
    await this.deleteWhere(manager, ExpandedFitAssessment, where, counts, 'expanded_fit_assessments_baseline');
    await this.deleteWhere(manager, RealityCheck, where, counts, 'reality_checks_baseline');
    await this.deleteWhere(manager, BaselineParsed, where, counts, 'baseline_parsed');

    const baselineSections = await manager.find(BaselineSection, {
      where: { baselineId: In(baselineIds) },
      select: ['id'],
    });
    const baselineSectionIds = baselineSections.map((record) => record.id);

    if (baselineSectionIds.length > 0) {
      await this.deleteWhere(
        manager,
        BaselineBlockPolicy,
        { baselineSectionId: In(baselineSectionIds) },
        counts,
        'baseline_block_policies_by_section',
      );
    }

    if (baselineVersionIds.length > 0) {
      await this.deleteWhere(
        manager,
        ComplianceAudit,
        { baselineVersionId: In(baselineVersionIds) },
        counts,
        'compliance_audits_baseline_version',
      );
      await this.deleteWhere(
        manager,
        BaselineBlockPolicy,
        { baselineVersionId: In(baselineVersionIds) },
        counts,
        'baseline_block_policies_by_version',
      );
    }

    await this.deleteWhere(manager, BaselineSection, where, counts, 'baseline_sections');
    await this.deleteWhere(manager, BaselineVersion, where, counts, 'baseline_versions');
  }

  private async deleteWhere<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: new () => T,
    where: Record<string, unknown>,
    counts: Record<string, number>,
    key: string,
  ) {
    const result = await manager.delete(entity, where);
    counts[key] = (counts[key] ?? 0) + (result.affected ?? 0);
  }
}
