import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AnalysisService } from '../analysis/analysis.service';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { CoverLettersService } from '../cover-letters/cover-letters.service';
import { CoverLetter } from '../cover-letters/cover-letter.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { JobsService } from '../jobs/jobs.service';
import { Opportunity } from '../opportunities/opportunity.entity';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { ResumeService } from '../resume/resume.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Application } from '../applications/application.entity';
import {
  buildSyntheticRunContext,
  buildSyntheticMetadata,
} from './synthetic-metadata.util';
import { SyntheticCleanupRun } from './synthetic-cleanup-run.entity';

const SCENARIO_KEY = 'core_loop_smoke';
const SYNTHETIC_USER_EMAIL = 'synthetic-core-loop@targetthisrole.local';
const SYNTHETIC_USER_PASSWORD = 'SyntheticUserPass!123';
const FIXTURE_BASELINE_FILENAME = 'core-loop-smoke-baseline.txt';
const FIXTURE_BASELINE_STORAGE_PATH = 'synthetic://core_loop_smoke/baseline_v1';

const FIXTURE_BASELINE_TEXT = `
Alex Candidate
Senior Support Operations Manager

Summary
I lead support operations programs for SaaS products, improving SLA attainment,
reducing escalations, and partnering with product and engineering to close root causes.

Experience
- Led a support operations team of 12 across queue management, incident response, and QA.
- Built KPI dashboards in SQL and Looker for SLA, first-response time, CSAT, and backlog.
- Partnered with product managers to prioritize reliability defects and automation opportunities.
- Implemented workflow automation with Zendesk and internal tooling, reducing manual triage.
- Drove weekly cross-functional review with engineering and customer success for major incidents.

Skills
Support Operations, Incident Management, Root Cause Analysis, Workflow Automation,
Customer Support Leadership, SQL, Dashboarding, Zendesk, Process Improvement
`.trim();

const FIXTURE_JOB_TEXT = `
Senior Support Operations Manager
Company: Example SaaS

We are hiring a Senior Support Operations Manager to own support effectiveness at scale.
You will build and maintain dashboards for SLA, CSAT, backlog, and response-time monitoring,
work cross-functionally with engineering and product on incident root causes,
and improve support workflows through process design and automation.

Responsibilities
- Own support operations health metrics and reporting for leadership.
- Drive queue strategy and incident response rigor.
- Partner with product and engineering to prioritize and resolve reliability issues.
- Define and execute workflow automation in support platforms.
- Coach support leads on process quality and continuous improvement.

Requirements
- 5+ years in support operations, technical support leadership, or service operations.
- Strong analytical skills with SQL-based reporting experience.
- Experience with incident management and cross-functional post-incident process improvement.
- Experience with support tooling and automation platforms.
- Strong written communication and stakeholder alignment skills.

This role is focused on operational excellence, measurable outcomes, and customer impact.
`.repeat(3).trim();

type StepStatus = 'succeeded' | 'failed';

type StepResult = {
  step: string;
  status: StepStatus;
  startedAt: string;
  finishedAt: string;
  details?: Record<string, unknown>;
  errorMessage?: string;
};

export type SyntheticTransactionResult = {
  scenarioKey: string;
  syntheticRunId: string;
  status: 'succeeded' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stepResults: StepResult[];
  summary: Record<string, unknown>;
  errorMessage: string | null;
};

@Injectable()
export class SyntheticTransactionRunnerService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jobsService: JobsService,
    private readonly analysisService: AnalysisService,
    private readonly resumeService: ResumeService,
    private readonly coverLettersService: CoverLettersService,
    private readonly opportunitiesService: OpportunitiesService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(CoverLetter)
    private readonly coverLetterRepository: Repository<CoverLetter>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    @InjectRepository(SyntheticCleanupRun)
    private readonly syntheticRunRepository: Repository<SyntheticCleanupRun>,
  ) {}

  async runCoreLoopSmoke(triggerSource: 'manual' | 'system' = 'manual'): Promise<SyntheticTransactionResult> {
    const startedAt = new Date();
    const runContext = buildSyntheticRunContext(SCENARIO_KEY, randomUUID());
    const syntheticMetadata = buildSyntheticMetadata({
      isSynthetic: true,
      syntheticScenarioKey: runContext.scenarioKey,
      syntheticRunId: runContext.runId,
      syntheticCreatedAt: runContext.syntheticCreatedAt,
      preserveFromCleanup: false,
    });

    const stepResults: StepResult[] = [];
    const summary: Record<string, unknown> = {};

    const run = await this.syntheticRunRepository.save(
      this.syntheticRunRepository.create({
        runType: 'synthetic_transaction',
        scenarioKey: SCENARIO_KEY,
        syntheticRunId: runContext.runId,
        status: 'started',
        triggerSource,
        summaryJson: {},
        stepResultsJson: [],
      }),
    );

    try {
      const userStep = await this.runStep('resolve_user', async () => {
        const user = await this.resolveOrCreateSyntheticUser(runContext);
        return {
          userId: user.id,
          created: (user.createdAt ?? runContext.syntheticCreatedAt).toISOString(),
        };
      });
      stepResults.push(userStep.result);
      if (userStep.result.status === 'failed') {
        throw new InternalServerErrorException(userStep.result.errorMessage ?? 'resolve_user failed');
      }
      const user = await this.userRepository.findOneOrFail({
        where: { id: String(userStep.result.details?.userId) },
      });

      const baselineStep = await this.runStep('resolve_baseline_fixture', async () => {
        const baseline = await this.resolveOrCreateBaselineFixture(user.id, runContext);
        return {
          baselineId: baseline.id,
          baselineVersionId: baseline.versions?.[0]?.id ?? null,
          preserved: baseline.preserveFromCleanup,
        };
      });
      stepResults.push(baselineStep.result);
      if (baselineStep.result.status === 'failed') {
        throw new InternalServerErrorException(
          baselineStep.result.errorMessage ?? 'resolve_baseline_fixture failed',
        );
      }
      const baselineId = String(baselineStep.result.details?.baselineId);
      const baselineVersionId = String(baselineStep.result.details?.baselineVersionId);
      if (!baselineVersionId) {
        throw new InternalServerErrorException('Baseline fixture missing version.');
      }

      const jobStep = await this.runStep('submit_synthetic_job', async () => {
        const created = await this.jobsService.createJob(user.id, {
          title: 'Senior Support Operations Manager',
          company: 'Example SaaS',
          rawDescription: FIXTURE_JOB_TEXT,
          sourceUrl: 'https://synthetic.targetthisrole.local/core-loop-smoke',
          jdIngestionMethod: JobIngestionMethod.PASTE,
        });
        return { jobId: created.job.id, warning: created.warning?.code ?? null };
      });
      stepResults.push(jobStep.result);
      if (jobStep.result.status === 'failed') {
        throw new InternalServerErrorException(
          jobStep.result.errorMessage ?? 'submit_synthetic_job failed',
        );
      }
      const jobId = String(jobStep.result.details?.jobId);

      const analysisStep = await this.runStep('run_fit_assessment', async () => {
        const result = await this.analysisService.runFitAssessment(
          user.id,
          {
            baselineId,
            jobId,
          },
          syntheticMetadata,
        );

        if (result.status !== 'ok' || !result.assessmentId) {
          throw new BadRequestException('Fit assessment did not return a persisted assessment.');
        }
        if (typeof result.score !== 'number' || Number.isNaN(result.score)) {
          throw new BadRequestException('Fit assessment score is missing or invalid.');
        }
        if (!result.verdict) {
          throw new BadRequestException('Fit assessment verdict is missing.');
        }

        return {
          assessmentId: result.assessmentId,
          score: result.score,
          verdict: result.verdict,
        };
      });
      stepResults.push(analysisStep.result);
      if (analysisStep.result.status === 'failed') {
        throw new InternalServerErrorException(
          analysisStep.result.errorMessage ?? 'run_fit_assessment failed',
        );
      }
      const assessmentId = String(analysisStep.result.details?.assessmentId);

      const resumeStep = await this.runStep('generate_resume_preview', async () => {
        const result = await this.resumeService.generateResume(
          user.id,
          {
            baselineId,
            baselineVersionId,
            jobId,
            analysisId: assessmentId,
            oneTap: false,
          },
          undefined,
          syntheticMetadata,
        );

        if (result.status !== 'success') {
          throw new BadRequestException('Resume generation did not succeed.');
        }
        const resumePreview = result.preview?.resume;
        if (!resumePreview || !Array.isArray(resumePreview.experience) || resumePreview.experience.length === 0) {
          throw new BadRequestException('Resume preview is missing structured content.');
        }

        return {
          trackerEntryId: result.trackerEntryId ?? null,
          opportunityId: result.opportunityId ?? null,
          experienceCount: resumePreview.experience.length,
        };
      });
      stepResults.push(resumeStep.result);
      if (resumeStep.result.status === 'failed') {
        throw new InternalServerErrorException(
          resumeStep.result.errorMessage ?? 'generate_resume_preview failed',
        );
      }

      const coverStep = await this.runStep('generate_cover_letter_preview', async () => {
        const result = await this.coverLettersService.generateCoverLetter(
          user.id,
          {
            baselineId,
            baselineVersionId,
            jobId,
            analysisId: assessmentId,
            closingTemplateKey: 'steady',
          },
          syntheticMetadata,
        );

        if (result.status !== 'success') {
          throw new BadRequestException('Cover letter generation did not succeed.');
        }
        const previewPayload = result.preview?.coverLetter;
        const previewText = JSON.stringify(previewPayload ?? {});
        if (!previewPayload || previewText.length < 50) {
          throw new BadRequestException('Cover letter preview content is empty.');
        }

        return {
          coverLetterId: (result as { id?: string }).id ?? null,
          previewLength: previewText.length,
        };
      });
      stepResults.push(coverStep.result);
      if (coverStep.result.status === 'failed') {
        throw new InternalServerErrorException(
          coverStep.result.errorMessage ?? 'generate_cover_letter_preview failed',
        );
      }

      const opportunityStep = await this.runStep('save_opportunity', async () => {
        const assessment = await this.fitAssessmentRepository.findOneOrFail({ where: { id: assessmentId } });
        const opportunity = await this.opportunitiesService.upsertOpportunity(
          user.id,
          {
            analysisId: assessment.id,
            jobId,
            baselineId,
            company: 'Example SaaS',
            roleTitle: 'Senior Support Operations Manager',
            score: assessment.overallScore,
            notes: 'synthetic core loop smoke run',
          },
          syntheticMetadata,
        );

        if (!opportunity?.id) {
          throw new BadRequestException('Opportunity save did not persist.');
        }

        return { opportunityId: opportunity.id, score: opportunity.currentScore };
      });
      stepResults.push(opportunityStep.result);
      if (opportunityStep.result.status === 'failed') {
        throw new InternalServerErrorException(
          opportunityStep.result.errorMessage ?? 'save_opportunity failed',
        );
      }

      await this.assertSyntheticPropagation({
        userId: user.id,
        assessmentId,
        opportunityId: String(opportunityStep.result.details?.opportunityId),
        runId: runContext.runId,
      });

      summary.userId = user.id;
      summary.baselineId = baselineId;
      summary.baselineVersionId = baselineVersionId;
      summary.jobId = jobId;
      summary.assessmentId = assessmentId;
      summary.opportunityId = opportunityStep.result.details?.opportunityId ?? null;

      const finishedAt = new Date();
      const output: SyntheticTransactionResult = {
        scenarioKey: SCENARIO_KEY,
        syntheticRunId: runContext.runId,
        status: 'succeeded',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stepResults,
        summary,
        errorMessage: null,
      };

      await this.syntheticRunRepository.update(run.id, {
        status: 'succeeded',
        finishedAt,
        durationMs: output.durationMs,
        stepResultsJson: stepResults,
        summaryJson: { ...summary } as any,
      });

      return output;
    } catch (error) {
      const finishedAt = new Date();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const output: SyntheticTransactionResult = {
        scenarioKey: SCENARIO_KEY,
        syntheticRunId: runContext.runId,
        status: 'failed',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stepResults,
        summary,
        errorMessage,
      };

      await this.syntheticRunRepository.update(run.id, {
        status: 'failed',
        finishedAt,
        durationMs: output.durationMs,
        stepResultsJson: stepResults,
        summaryJson: { ...summary } as any,
        errorMessage,
      });

      return output;
    }
  }

  async listRecentSyntheticTransactionRuns(limit = 20): Promise<SyntheticCleanupRun[]> {
    return this.syntheticRunRepository.find({
      where: {
        runType: 'synthetic_transaction',
        scenarioKey: SCENARIO_KEY,
      },
      order: { startedAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async getLatestCoreLoopRun(): Promise<SyntheticCleanupRun | null> {
    return this.syntheticRunRepository.findOne({
      where: { runType: 'synthetic_transaction', scenarioKey: SCENARIO_KEY },
      order: { startedAt: 'DESC' },
    });
  }

  private async runStep(
    step: string,
    handler: () => Promise<Record<string, unknown>>,
  ): Promise<{ result: StepResult }> {
    const startedAt = new Date();
    try {
      const details = await handler();
      return {
        result: {
          step,
          status: 'succeeded',
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          details,
        },
      };
    } catch (error) {
      return {
        result: {
          step,
          status: 'failed',
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  private async resolveOrCreateSyntheticUser(runContext: {
    scenarioKey: string;
    runId: string;
    syntheticCreatedAt: Date;
  }): Promise<User> {
    const existing = await this.usersService.findByEmail(SYNTHETIC_USER_EMAIL);
    if (existing) {
      if (!existing.isSynthetic || !existing.preserveFromCleanup) {
        existing.isSynthetic = true;
        existing.preserveFromCleanup = true;
        existing.syntheticScenarioKey = runContext.scenarioKey;
        existing.syntheticRunId = runContext.runId;
        existing.syntheticCreatedAt = runContext.syntheticCreatedAt;
        await this.userRepository.save(existing);
      }
      return existing;
    }

    const passwordHash = hashSync(SYNTHETIC_USER_PASSWORD, 10);
    return this.usersService.create(
      {
        email: SYNTHETIC_USER_EMAIL,
        passwordHash,
        firstName: 'Synthetic',
        lastName: 'Runner',
        emailConfirmed: true,
      },
      {
        isSynthetic: true,
        syntheticScenarioKey: runContext.scenarioKey,
        syntheticRunId: runContext.runId,
        syntheticCreatedAt: runContext.syntheticCreatedAt,
        preserveFromCleanup: true,
      },
    );
  }

  private async resolveOrCreateBaselineFixture(
    userId: string,
    runContext: { scenarioKey: string; runId: string; syntheticCreatedAt: Date },
  ): Promise<Baseline & { versions?: BaselineVersion[] }> {
    const existing = await this.baselineRepository.findOne({
      where: {
        userId,
        originalFilename: FIXTURE_BASELINE_FILENAME,
      },
      relations: ['versions'],
      order: { versions: { createdAt: 'DESC' } },
    });

    if (existing && existing.versions?.[0]) {
      if (!existing.preserveFromCleanup || !existing.isSynthetic) {
        existing.isSynthetic = true;
        existing.preserveFromCleanup = true;
        existing.syntheticScenarioKey = runContext.scenarioKey;
        existing.syntheticRunId = runContext.runId;
        existing.syntheticCreatedAt = runContext.syntheticCreatedAt;
        await this.baselineRepository.save(existing);
      }
      return existing;
    }

    const baseline = this.baselineRepository.create({
      userId,
      originalFilename: FIXTURE_BASELINE_FILENAME,
      mimeType: 'text/plain',
      storagePath: FIXTURE_BASELINE_STORAGE_PATH,
      hash: 'core-loop-smoke-baseline-hash-v1',
      version: 1,
      isSynthetic: true,
      syntheticScenarioKey: runContext.scenarioKey,
      syntheticRunId: runContext.runId,
      syntheticCreatedAt: runContext.syntheticCreatedAt,
      preserveFromCleanup: true,
    });
    const savedBaseline = await this.baselineRepository.save(baseline);

    const section = this.baselineSectionRepository.create({
      baselineId: savedBaseline.id,
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Synthetic Baseline Fixture',
      content: FIXTURE_BASELINE_TEXT,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
    });
    const savedSection = await this.baselineSectionRepository.save(section);

    const version = this.baselineVersionRepository.create({
      baselineId: savedBaseline.id,
      versionNumber: 1,
      fileHash: 'core-loop-smoke-version-hash-v1',
      storagePath: FIXTURE_BASELINE_STORAGE_PATH,
      verifiedAdditions: [],
      additionDiff: null,
      promotedFromInterviewId: null,
      allowedCompanies: ['Example SaaS'],
      allowedRoles: ['Senior Support Operations Manager'],
      allowedTechnologies: ['SQL', 'Zendesk'],
      allowedMetricTokens: ['SLA', 'CSAT'],
    });
    const savedVersion = await this.baselineVersionRepository.save(version);

    const blockPolicy = this.baselineBlockPolicyRepository.create({
      baselineVersionId: savedVersion.id,
      baselineSectionId: savedSection.id,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
    });
    await this.baselineBlockPolicyRepository.save(blockPolicy);

    return { ...savedBaseline, versions: [savedVersion] };
  }

  private async assertSyntheticPropagation(input: {
    userId: string;
    assessmentId: string;
    opportunityId: string;
    runId: string;
  }) {
    const [assessment, opportunity, coverLetter, application] = await Promise.all([
      this.fitAssessmentRepository.findOne({ where: { id: input.assessmentId, userId: input.userId } }),
      this.opportunityRepository.findOne({ where: { id: input.opportunityId, userId: input.userId } }),
      this.coverLetterRepository.findOne({
        where: { userId: input.userId, syntheticRunId: input.runId },
        order: { createdAt: 'DESC' },
      }),
      this.applicationRepository.findOne({
        where: { userId: input.userId, syntheticRunId: input.runId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const records = [assessment, opportunity, coverLetter, application];
    if (records.some((record) => !record || !record.isSynthetic || record.syntheticRunId !== input.runId)) {
      throw new InternalServerErrorException('Synthetic metadata propagation check failed.');
    }
  }
}
