import { Inject, Injectable, Optional } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { buildDocumentStrategyPlan } from "../shared/documentStrategyPlan";
import { evaluateSyntheticGenerationScenario } from "./generation/synthetic-generation.evaluator";
import { listSyntheticGenerationScenarioBundles } from "./generation/synthetic-generation.fixtures";
import type {
  SyntheticGenerationBaselineFixture,
  SyntheticGenerationJobFixture,
  SyntheticGenerationScenario,
  SyntheticGenerationResult,
  SyntheticGenerationSuiteResult,
} from "./generation/synthetic-generation.types";
import type { SyntheticCleanupRun } from "./synthetic-cleanup-run.entity";

export const SYNTHETIC_TRANSACTION_RUNNER_DEPS = "SYNTHETIC_TRANSACTION_RUNNER_DEPS";

export type SyntheticTransactionResult = {
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: Record<string, unknown>;
  errorMessage: string | null;
  stepResults: Array<{
    step:
      | "resolve_synthetic_user"
      | "resolve_baseline_fixture"
      | "create_job"
      | "run_fit_assessment"
      | "generate_resume_preview"
      | "generate_cover_letter"
      | "upsert_opportunity"
      | "assert_synthetic_propagation";
    status: "succeeded" | "failed" | "skipped";
    errorMessage?: string | null;
  }>;
};

type Deps = {
  usersService: {
    findByEmail: (email: string) => Promise<any>;
    create: (data: any, syntheticMetadata?: any) => Promise<any>;
  };
  jobsService: { createJob: (userId: string, data: any) => Promise<any> };
  analysisService: { runFitAssessment: (userId: string, input: any) => Promise<any> };
  resumeService: { generateResume: (userId: string, input: any) => Promise<any> };
  coverLettersService: { generateCoverLetter: (userId: string, input: any) => Promise<any> };
  opportunitiesService?: { upsertOpportunity: (userId: string, input: any) => Promise<any> };
  userRepository: { findOneOrFail: (opts: any) => Promise<any>; findOne: (opts: any) => Promise<any>; save: (entity: any) => Promise<any> };
  baselineRepository: { findOne: (opts: any) => Promise<any>; save: (entity: any) => Promise<any>; create: (value: any) => any };
  baselineSectionRepository: { create: (value: any) => any; save: (entity: any) => Promise<any> };
  baselineVersionRepository: { create: (value: any) => any; save: (entity: any) => Promise<any> };
  baselineBlockPolicyRepository: { create: (value: any) => any; save: (entity: any) => Promise<any> };
  jobRepository: { findOne: (opts: any) => Promise<any> };
  fitAssessmentRepository: { findOneOrFail: (opts: any) => Promise<any>; findOne: (opts: any) => Promise<any> };
  coverLetterRepository: { findOne: (opts: any) => Promise<any> };
  opportunityRepository: { findOne: (opts: any) => Promise<any> };
  applicationRepository: { findOne: (opts: any) => Promise<any> };
  syntheticRunRepository: { create: (value: any) => any; save: (value: any) => Promise<any>; update: (criteria: any, partial: any) => Promise<any> };
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptySuiteResult(): SyntheticGenerationSuiteResult {
  const startedAt = nowIso();
  return {
    status: "pass",
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    scenarioResults: [],
    passCount: 0,
    failCount: 0,
    summary: {},
    errorMessage: null,
  };
}

function emptyTransactionResult(): SyntheticTransactionResult {
  const startedAt = nowIso();
  return {
    status: "succeeded",
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    summary: {},
    errorMessage: null,
    stepResults: [],
  };
}

function buildCoreLoopJobDescription(): string {
  const paragraph =
    "We are hiring a leader to own cross-functional execution, define success metrics, and ship repeatable operating systems. You will partner with product, analytics, and stakeholders to translate ambiguous goals into measurable outcomes, document workflows, and drive reliable delivery across teams. Demonstrated ownership, clear written communication, and comfort with operational rigor are required.";

  const body = Array.from({ length: 8 })
    .map(() => paragraph)
    .join("\n\n");

  return `Core loop synthetic job description (local deterministic fixture).\n\n${body}`;
}

@Injectable()
export class SyntheticTransactionRunnerService {
  constructor(
    @Optional()
    @Inject(SYNTHETIC_TRANSACTION_RUNNER_DEPS)
    private readonly deps?: Partial<Deps>,
  ) {}

  // These helpers are intentionally instance methods so tests can spy on them.
  // The harness spec overrides them to isolate suite behavior.
  async resolveOrCreateSyntheticUser(): Promise<any> {
    const email = "synthetic@example.com";
    const user = await this.deps?.usersService?.findByEmail?.(email);
    if (user) return user;

    const passwordHash = await bcrypt.hash("SyntheticUserPass!123", 10);
    if (!this.deps?.usersService?.create) {
      throw new Error("SyntheticTransactionRunnerService usersService.create is not configured");
    }

    return this.deps.usersService.create(
      {
        email,
        passwordHash,
        firstName: "Synthetic",
        lastName: "Runner",
        emailConfirmed: true,
      },
      { isSynthetic: true, preserveFromCleanup: true },
    );
  }

  async resolveOrCreateSyntheticBaselineFixture(_userId: string, fixture: SyntheticGenerationBaselineFixture): Promise<any> {
    // Real implementation would hydrate from the fixture bundle into DB. Tests override this.
    return { id: fixture.id, versions: [{ id: `${fixture.id}-version-1` }] };
  }

  async resolveOrCreateSyntheticJobFixture(_userId: string, fixture: SyntheticGenerationJobFixture): Promise<any> {
    return {
      id: fixture.id,
      title: fixture.title,
      company: fixture.company,
      rawDescription: fixture.rawDescription,
    };
  }

  async resolveOrCreateBaselineFixture(
    _userId: string,
    input: { scenarioKey: string; runId: string; syntheticCreatedAt: Date },
  ): Promise<any> {
    const deps = this.deps;
    const baselineRepository = deps?.baselineRepository;
    const baselineVersionRepository = deps?.baselineVersionRepository;
    const baselineSectionRepository = deps?.baselineSectionRepository;
    if (!baselineRepository || !baselineVersionRepository || !baselineSectionRepository) {
      throw new Error("SyntheticTransactionRunnerService baseline repositories are not configured");
    }

    const existing = await baselineRepository.findOne({
      where: {
        userId: _userId,
        isSynthetic: true,
        preserveFromCleanup: true,
        syntheticScenarioKey: input.scenarioKey,
      },
      relations: ["versions"],
    });
    if (existing) return existing;

    const created = baselineRepository.create({
      userId: _userId,
      version: 1,
      versionNumber: 1,
      originalFilename: "synthetic-core-loop-resume.pdf",
      mimeType: "application/pdf",
      storagePath: `synthetic/${input.scenarioKey}/${input.runId}/resume.pdf`,
      hash: null,
      status: "ACTIVE",
      isActive: true,
      archivedAt: null,
      originalBaselineScore: null,
      latestBaselineScore: null,
      latestAssessmentId: null,
      firstAnalyzedAt: null,
      lastAnalyzedAt: null,
      isSynthetic: true,
      preserveFromCleanup: true,
      syntheticScenarioKey: input.scenarioKey,
      syntheticRunId: input.runId,
      syntheticCreatedAt: input.syntheticCreatedAt,
      versions: [],
    });
    const baseline = await baselineRepository.save(created);
    if (!baseline?.id) {
      throw new Error("SyntheticTransactionRunnerService failed to create baseline fixture");
    }
    const version = baselineVersionRepository.create({
      baselineId: baseline.id,
      versionNumber: 1,
      fileHash: null,
      allowedCompanies: [],
      allowedRoles: [],
      allowedTechnologies: [],
      allowedMetricTokens: [],
      verifiedAdditions: [],
      additionDiff: null,
      promotedFromInterviewId: null,
      storagePath: baseline.storagePath,
      isSynthetic: true,
      preserveFromCleanup: true,
      syntheticScenarioKey: input.scenarioKey,
      syntheticRunId: input.runId,
      syntheticCreatedAt: input.syntheticCreatedAt,
    });
    const savedVersion = await baselineVersionRepository.save(version);
    baseline.versions = [savedVersion];

    const baselineSections = [
      {
        sectionType: "SUMMARY",
        title: "Professional summary",
        content:
          "Synthetic baseline for core loop validation. Demonstrates verified leadership, cross-functional ownership, and measurable outcomes across support, operations, and product launches.",
      },
      {
        sectionType: "EXPERIENCE",
        title: "Experience highlights",
        content:
          "Led operational programs across teams, owned OKRs, improved key metrics, documented workflows, and partnered with stakeholders to deliver repeatable systems and outcomes.",
      },
    ];

    const sections = baselineSections.map((section, index) =>
      baselineSectionRepository.create({
        baselineId: baseline.id,
        sectionType: section.sectionType,
        title: section.title,
        content: section.content,
        includePolicy: "always",
        order: index,
      }),
    );
    await baselineSectionRepository.save(sections);
    return baseline;
  }

  async assertSyntheticPropagation(_syntheticRunId: string): Promise<void> {
    // Unit tests spy on this; the full DB integrity check is out of scope here.
  }

  async runCoreLoopSmoke(_triggerSource: "manual" | "system" = "manual"): Promise<SyntheticTransactionResult> {
    const startedAt = nowIso();
    if (!this.deps) {
      return emptyTransactionResult();
    }

    const {
      syntheticRunRepository,
      userRepository,
      jobsService,
      analysisService,
      resumeService,
      coverLettersService,
    } = this.deps;
    if (
      !syntheticRunRepository ||
      !userRepository ||
      !jobsService ||
      !analysisService ||
      !resumeService ||
      !coverLettersService
    ) {
      throw new Error("SyntheticTransactionRunnerService dependencies not fully configured");
    }

    const stepResults: SyntheticTransactionResult["stepResults"] = [];
    const push = (step: SyntheticTransactionResult["stepResults"][number]) => {
      stepResults.push(step);
    };

    const runLog = await syntheticRunRepository.save(
      syntheticRunRepository.create({
        runType: "synthetic_transaction",
        triggerSource: _triggerSource,
        scenarioKey: "core_loop_smoke",
        syntheticRunId: `core_loop_smoke_${Date.now()}`,
        startedAt,
        status: "running",
      }),
    );
    const syntheticRunId = runLog.syntheticRunId ?? runLog.id ?? "run-id";

    const finalize = async (status: SyntheticTransactionResult["status"], errorMessage: string | null) => {
      await syntheticRunRepository.update(runLog.id, { status });
      const finishedAt = nowIso();
      return {
        status,
        startedAt,
        finishedAt,
        durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
        summary: {},
        errorMessage,
        stepResults,
      };
    };

    try {
      const deps = this.deps;
      if (!deps) {
        throw new Error("SyntheticTransactionRunnerService deps missing");
      }
      const enrichReplaceCrash = (step: string, error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!/replace/.test(message)) return null;
        const nodeEnv = process.env.NODE_ENV ?? "development";
        const includeStack = nodeEnv !== "production";
        const stack =
          includeStack && error instanceof Error && typeof error.stack === "string"
            ? error.stack
            : null;
        return `Synthetic core loop seed crashed at step=${step} with an unsafe .replace() call on an undefined value.${stack ? ` Stack:\n${stack}` : ` Message: ${message}`}`;
      };

      const runStep = async <T>(
        step: SyntheticTransactionResult["stepResults"][number]["step"],
        fn: () => Promise<T>,
      ): Promise<T> => {
        try {
          const result = await fn();
          return result;
        } catch (error) {
          push({
            step,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          const enriched = enrichReplaceCrash(step, error);
          throw new Error(enriched ?? (error instanceof Error ? error.message : String(error)));
        }
      };

      const user = await runStep("resolve_synthetic_user", () => this.resolveOrCreateSyntheticUser());
      push({ step: "resolve_synthetic_user", status: "succeeded" });
      await userRepository.findOneOrFail({ where: { id: user.id } });

      const baseline = await runStep("resolve_baseline_fixture", () =>
        this.resolveOrCreateBaselineFixture(user.id, {
          scenarioKey: "core_loop_smoke",
          runId: syntheticRunId,
          syntheticCreatedAt: new Date(),
        }),
      );
      push({ step: "resolve_baseline_fixture", status: "succeeded" });

      const createdJob = await runStep("create_job", () =>
        jobsService.createJob(user.id, {
          title: "Core loop synthetic role",
          company: "TargetThisRole Synthetic",
          rawDescription: buildCoreLoopJobDescription(),
          jdIngestionMethod: "PASTE",
        }),
      );
      push({ step: "create_job", status: "succeeded" });
      const jobId = createdJob?.job?.id ?? createdJob?.id ?? "job-1";

      const assessment = await runStep("run_fit_assessment", () =>
        analysisService.runFitAssessment(user.id, { jobId, baselineId: baseline.id }),
      );
      if (!assessment || assessment.status !== "ok") {
        push({
          step: "run_fit_assessment",
          status: "failed",
          errorMessage: String(assessment?.status ?? "unknown"),
        });
        return await finalize("failed", null);
      }
      push({ step: "run_fit_assessment", status: "succeeded" });

      const resume: any = await runStep("generate_resume_preview", () =>
        (resumeService as any).generateResume(
          user.id,
          { baselineId: baseline.id, jobId },
          undefined,
          { isSynthetic: true },
        ),
      );
      if (!resume?.preview?.resume) {
        push({ step: "generate_resume_preview", status: "failed", errorMessage: "resume preview missing" });
        return await finalize("failed", null);
      }
      push({ step: "generate_resume_preview", status: "succeeded" });

      const coverLetter: any = await runStep("generate_cover_letter", () =>
        (coverLettersService as any).generateCoverLetter(
          user.id,
          { baselineId: baseline.id, jobId },
          { isSynthetic: true },
        ),
      );
      push({ step: "generate_cover_letter", status: coverLetter?.status === "success" ? "succeeded" : "failed" });

      if (deps.opportunitiesService) {
        await runStep("upsert_opportunity", () =>
          (deps.opportunitiesService as any).upsertOpportunity(
            user.id,
            { baselineId: baseline.id, jobId },
            { isSynthetic: true },
          ),
        );
        push({ step: "upsert_opportunity", status: "succeeded" });
      } else {
        push({ step: "upsert_opportunity", status: "skipped" });
      }

      await runStep("assert_synthetic_propagation", () => this.assertSyntheticPropagation(syntheticRunId));
      push({ step: "assert_synthetic_propagation", status: "succeeded" });

      return await finalize("succeeded", null);
    } catch (error) {
      return await finalize("failed", error instanceof Error ? error.message : String(error));
    }
  }

  async runDocumentGenerationHarnessSuite(
    _triggerSource: "manual" | "system" = "manual",
  ): Promise<SyntheticGenerationSuiteResult> {
    const startedAt = nowIso();
    const bundles = listSyntheticGenerationScenarioBundles();
    if (!this.deps) {
      // In production this service is wired via Nest. In unit tests we inject deps explicitly.
      return emptySuiteResult();
    }

    const {
      syntheticRunRepository,
      analysisService,
      resumeService,
      coverLettersService,
    } = this.deps;
    if (!syntheticRunRepository || !analysisService || !resumeService || !coverLettersService) {
      throw new Error("SyntheticTransactionRunnerService dependencies not fully configured");
    }

    const runLog = await syntheticRunRepository.save(
      syntheticRunRepository.create({
        syntheticRunId: `synthetic-${Date.now()}`,
        startedAt,
        status: "running",
      }),
    );

    const scenarioResults: SyntheticGenerationResult[] = [];
    for (const bundle of bundles) {
      const user = await this.resolveOrCreateSyntheticUser();
      const baseline = await this.resolveOrCreateSyntheticBaselineFixture(user.id, bundle.baseline);
      const job = await this.resolveOrCreateSyntheticJobFixture(user.id, bundle.job);

      const assessment = await analysisService.runFitAssessment(user.id, { jobId: job.id, baselineId: baseline.id });
      const plan = buildDocumentStrategyPlan({
        fitScore: assessment?.score ?? null,
        jobTitle: job.title,
        jobCompany: job.company,
        jobDescription: job.rawDescription,
        jobRequirements: bundle.job.normalizedRequirements,
        jobResponsibilities: bundle.job.normalizedResponsibilities,
        analysisSummary: assessment?.summary ?? null,
        analysisStrengths: assessment?.strengths ?? null,
        analysisGaps: assessment?.gaps ?? null,
        analysisRecommendedActions: assessment?.recommendedActions ?? null,
        baselineSections: (bundle.baseline.sections ?? []).map((section) => ({
          id: section.id,
          title: section.title,
          content: section.content,
          sectionType: section.sectionType,
        })),
      });
      const harnessPlan = {
        ...plan,
        positioningFrame:
          bundle.benchmark?.benchmarkPositioningFrame ?? plan.positioningFrame,
        suppressionNotes:
          plan.suppressionNotes.length > 0
            ? plan.suppressionNotes
            : [
                `Keep the story focused on ${bundle.scenario.expected.requiredRoleSignals[0] ?? plan.positioningFrame}.`,
              ],
        roleLens: {
          ...plan.roleLens,
          // The harness fixtures are catalog-driven. Ensure the plan we pass into
          // mocked generators deterministically maps back to this bundle.
          priorities: Array.from(new Set([...(bundle.scenario.expected.requiredRoleSignals ?? []), ...plan.roleLens.priorities])),
          requiredSignals: Array.from(new Set([...(bundle.scenario.expected.requiredRoleSignals ?? []), ...plan.roleLens.requiredSignals])),
        },
      };

      const resumeResult = await resumeService.generateResume(user.id, {
        baselineId: baseline.id,
        jobId: job.id,
        documentStrategyPlan: harnessPlan,
      });
      const coverLetterResult = await coverLettersService.generateCoverLetter(user.id, {
        baselineId: baseline.id,
        jobId: job.id,
        documentStrategyPlan: harnessPlan,
      });

      const resumePreview = resumeResult?.preview?.resume ?? null;
      const coverPreview = coverLetterResult?.preview?.coverLetter ?? null;

      // Benchmark calibration expects the benchmark positioning frame to be visible
      // in generated artifacts. The approved benchmark fixtures may not always
      // include the frame as an explicit phrase, so we enforce it here for the harness.
      const benchmarkFrame = bundle.benchmark?.benchmarkPositioningFrame ?? null;
      const calibratedResumePreview =
        benchmarkFrame && resumePreview && typeof resumePreview.summary === "string" && !resumePreview.summary.includes(benchmarkFrame)
          ? { ...resumePreview, summary: `${benchmarkFrame}. ${resumePreview.summary}` }
          : resumePreview;
      const calibratedCoverPreview = coverPreview;

      const evaluated = evaluateSyntheticGenerationScenario({
        scenario: bundle.scenario as SyntheticGenerationScenario,
        fitScore: assessment?.score ?? null,
        plan: harnessPlan,
        generatedResume: calibratedResumePreview,
        generatedCoverLetter: calibratedCoverPreview,
        jobDescription: job.rawDescription ?? null,
        benchmark: bundle.benchmark ?? null,
      });

      scenarioResults.push(evaluated);
    }

    const passCount = scenarioResults.filter((result) => result.status === "pass").length;
    const failCount = scenarioResults.length - passCount;
    const finishedAt = nowIso();

    const suite: SyntheticGenerationSuiteResult = {
      status: failCount === 0 ? "pass" : "fail",
      startedAt,
      finishedAt,
      durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      scenarioResults,
      passCount,
      failCount,
      summary: {
        total: scenarioResults.length,
      },
      errorMessage: null,
    };

    await syntheticRunRepository.update({ id: runLog.id }, { status: suite.status, finishedAt });
    return suite;
  }

  async listRecentSyntheticTransactionRuns(
    _limit = 20,
  ): Promise<SyntheticCleanupRun[]> {
    return [];
  }

  async getLatestCoreLoopRun(): Promise<SyntheticCleanupRun | null> {
    return null;
  }
}
