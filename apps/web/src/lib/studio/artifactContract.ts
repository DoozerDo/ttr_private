import type { ResumeModel } from "@/lib/resumeModel";
import { estimateResumeModelBodyLength } from "@/lib/resumePreviewContract";
import {
  presentCoverLetterGeneration,
  presentResumeGeneration,
} from "@/src/lib/studio/helpers";
import { validateCoverLetterQuality, validateResumeQuality } from "@/src/lib/studio/artifactQuality";
import type { ArtifactGenerationResult } from "@shared/artifactGenerationResult";
import { isReusableGeneratedArtifact } from "@shared/isReusableGeneratedArtifact";
import { STUDIO_GENERATION_PIPELINE_VERSION } from "@shared/studioGenerationPipelineVersion";
import { resolveDocumentReadinessState } from "@shared/documentReadinessState";

export type StudioCoverLetterModel = {
  paragraphs: string[];
};

type ReadinessArtifactLike = {
  exportReady?: unknown;
  generationState?: unknown;
  qualityGate?: { status?: unknown; reasons?: unknown } | null;
  correctionReasons?: Array<{ code?: unknown; message?: unknown }> | null;
  qualityStatus?: unknown;
};

type PresentReadinessArtifact = ReadinessArtifactLike & { generationState: unknown };

function isPresentSingleArtifact(artifact: ReadinessArtifactLike | null): artifact is PresentReadinessArtifact {
  if (!artifact) return false;
  const state = String(artifact.generationState ?? "").trim();
  if (!state) return false;
  return state !== "not_started" && state !== "generating" && state !== "missing";
}

function isFailedSingleArtifact(artifact: ReadinessArtifactLike | null): boolean {
  if (!artifact) return false;
  const gs = String(artifact.generationState ?? "").trim().toLowerCase();
  if (gs === "generation_failed" || gs === "failed") return true;
  return false;
}

function isExportableSingleArtifact(artifact: ReadinessArtifactLike | null): boolean {
  if (!isPresentSingleArtifact(artifact)) return false;
  if (isFailedSingleArtifact(artifact)) return false;
  if (artifact.exportReady !== true) return false;
  return true;
}

export type StudioArtifactContractInput = {
  resumeResponse: unknown;
  coverLetterResponse: unknown;
  critiqueResult?: unknown;
  canExportDocuments: boolean;
  isPro: boolean;
  persistedPipelineVersion?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
};

export type StudioArtifactDisplayContract = {
  resumePreviewRenderable: boolean;
  coverLetterPreviewRenderable: boolean;
  generationRunning: boolean;
  generationFailed: boolean;
  generationComplete: boolean;
  shouldAutoGenerateStart: boolean;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readResumeResultPreviewModel(value: unknown): ResumeModel | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const preview = toRecord(record.preview);
  if (!preview) return null;
  const wrappedResume = toRecord(preview.resume);
  if (wrappedResume) return wrappedResume as ResumeModel;
  return preview as ResumeModel;
}

function readCoverLetterResultParagraphs(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const preview = toRecord(record.preview);
  if (!preview) return [];
  const coverLetter = toRecord(preview.coverLetter) ?? preview;
  const paragraphs = coverLetter.paragraphs;
  return Array.isArray(paragraphs) ? paragraphs.map((p) => String(p ?? "")).filter(Boolean) : [];
}

function isMinimalResumeArtifact(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  const internal = toRecord(record.internal);
  const resumeGenerationMode = String(internal?.resumeGenerationMode ?? "").trim().toLowerCase();
  const auditId = String(record.auditId ?? record.audit_id ?? "").trim().toLowerCase();
  return Boolean(
    internal?.minimalFallback === true ||
      internal?.resumeFailSafeMinimalUsed === true ||
      resumeGenerationMode === "top_level_fail_safe_minimal" ||
      auditId.startsWith("minimal:"),
  );
}

function normalizeHydratedResult<TPreview>(
  artifactType: "resume" | "cover_letter",
  payload: unknown,
): ArtifactGenerationResult<TPreview> | null {
  const record = toRecord(payload);
  if (!record) return null;

  const nestedKey = artifactType === "resume" ? "resumeResult" : "coverLetterResult";
  const nestedResult = toRecord(record[nestedKey]);
  const candidate = nestedResult ?? null;
  if (!candidate) return null;

  const generationState = String(candidate.generationState ?? "").trim();
  const qualityStatus = String(candidate.qualityStatus ?? "").trim();
  if (!generationState || !qualityStatus) return null;

  return candidate as ArtifactGenerationResult<TPreview>;
}

export function buildStudioArtifactContract(input: StudioArtifactContractInput) {
  const resumeResult = normalizeHydratedResult<ResumeModel>("resume", input.resumeResponse);
  const coverLetterResult = normalizeHydratedResult<{ paragraphs: string[] }>("cover_letter", input.coverLetterResponse);
  const resumePreviewModel = readResumeResultPreviewModel(resumeResult);
  const coverParagraphs = readCoverLetterResultParagraphs(coverLetterResult);
  const resumePresenter = presentResumeGeneration(resumeResult ?? null);
  const coverPresenter = presentCoverLetterGeneration(coverLetterResult ?? null);

  const resumeModel: ResumeModel | null = resumePreviewModel;
  const coverLetterModel: StudioCoverLetterModel | null = coverParagraphs.length
    ? { paragraphs: coverParagraphs }
    : null;

  const resumeQuality = validateResumeQuality(resumeModel);
  const coverLetterQuality = validateCoverLetterQuality({
    paragraphs: coverParagraphs,
    jobTitle: input.jobTitle ?? null,
    companyName: input.companyName ?? null,
    resumeExportable: resumeQuality.exportable,
  });
  const resumeReusableDecision = isReusableGeneratedArtifact(resumeResult ?? null, {
    persistedPipelineVersion: input.persistedPipelineVersion ?? null,
    currentPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION,
  });
  const coverReusableDecision = isReusableGeneratedArtifact(coverLetterResult ?? null, {
    persistedPipelineVersion: input.persistedPipelineVersion ?? null,
    currentPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION,
  });
  const hasReusableArtifacts = resumeReusableDecision.reusable || coverReusableDecision.reusable;

  const resumeReadinessArtifact = (resumeResult ?? null) as ReadinessArtifactLike | null;
  const coverReadinessArtifact = (coverLetterResult ?? null) as ReadinessArtifactLike | null;

  const canonicalReadiness = resolveDocumentReadinessState({
    resumeArtifact: (resumeReadinessArtifact ?? null) as any,
    coverLetterArtifact: (coverReadinessArtifact ?? null) as any,
    critiqueResult: (input.critiqueResult as any) ?? null,
    qualityGate: null,
    exportReady: null,
    generationState: null,
  });

  const hasResumeArtifact = Boolean(resumeModel && estimateResumeModelBodyLength(resumeModel) > 0);
  const safeHasResumeArtifact = hasResumeArtifact && !isMinimalResumeArtifact(resumeResult);
  const hasCoverLetterArtifact = coverParagraphs.length > 0;

  const resumeGenState = String((resumeResult as any)?.generationState ?? "").trim().toLowerCase();
  const coverGenState = String((coverLetterResult as any)?.generationState ?? "").trim().toLowerCase();
  const generationRunning = resumeGenState === "generating" || coverGenState === "generating";
  const generationFailed = isFailedSingleArtifact(resumeReadinessArtifact) || isFailedSingleArtifact(coverReadinessArtifact);
  const generationComplete = hasResumeArtifact && hasCoverLetterArtifact;
  const shouldAutoGenerateStart = !generationRunning && (!safeHasResumeArtifact || !hasCoverLetterArtifact);

  const displayContract: StudioArtifactDisplayContract = {
    resumePreviewRenderable: safeHasResumeArtifact,
    coverLetterPreviewRenderable: hasCoverLetterArtifact,
    generationRunning,
    generationFailed,
    generationComplete,
    shouldAutoGenerateStart,
  };

  const hasUsableArtifacts =
    hasReusableArtifacts ||
    (Boolean(resumeModel) && resumeQuality.exportable && !isMinimalResumeArtifact(resumeResult)) ||
    (Boolean(coverLetterModel) && coverLetterQuality.exportable) ||
    safeHasResumeArtifact ||
    hasCoverLetterArtifact;

  const resumeExportAvailable =
    input.canExportDocuments && input.isPro && isExportableSingleArtifact(resumeReadinessArtifact) && !isMinimalResumeArtifact(resumeResult);
  const coverLetterExportAvailable =
    input.canExportDocuments && input.isPro && isExportableSingleArtifact(coverReadinessArtifact);

  if (process.env.DOCGEN_DIAGNOSTICS === "true") {
    // eslint-disable-next-line no-console
    console.log("[DOCGEN][reusableArtifactDecision]", {
      artifactPipelineVersion: STUDIO_GENERATION_PIPELINE_VERSION,
      persistedPipelineVersion: input.persistedPipelineVersion ?? null,
      resume: resumeReusableDecision,
      coverLetter: coverReusableDecision,
      regenerationForced: Boolean(resumeReusableDecision.pipelineVersionMismatch || coverReusableDecision.pipelineVersionMismatch),
      reuseBlockedBy: {
        resume: resumeReusableDecision.reusable ? null : resumeReusableDecision.reasons,
        coverLetter: coverReusableDecision.reusable ? null : coverReusableDecision.reasons,
      },
    });
    // eslint-disable-next-line no-console
    console.log("[DOCGEN][canonical_readiness_state]", {
      canonicalReadinessState: canonicalReadiness.state,
      readinessInputs: {
        resume: resumeResult ?? null,
        coverLetter: coverLetterResult ?? null,
        critiqueResult: input.critiqueResult ?? null,
      },
      overridden: canonicalReadiness.impossibleStatePrevented,
      impossibleStatePrevented: canonicalReadiness.impossibleStatePrevented,
    });
  }

  return {
    canonicalReadinessState: canonicalReadiness.state,
    canonicalReadinessReasons: canonicalReadiness.reasons,
    impossibleStatePrevented: canonicalReadiness.impossibleStatePrevented,
    hasResumeArtifact: safeHasResumeArtifact,
    hasCoverLetterArtifact,
    hasUsableArtifacts,
    hasReusableArtifacts,
    reusableDecisions: {
      resume: resumeReusableDecision,
      coverLetter: coverReusableDecision,
    },
    resumeModel,
    coverLetterModel,
    results: {
      resume: resumeResult ?? null,
      coverLetter: coverLetterResult ?? null,
    },
    quality: {
      resume: resumeQuality,
      coverLetter: coverLetterQuality,
    },
    resumeExportAvailable,
    coverLetterExportAvailable,
    normalized: {
      resumeResponse: input.resumeResponse,
      coverLetterResponse: input.coverLetterResponse,
    },
    presenters: {
      resume: resumePresenter,
      coverLetter: coverPresenter,
    },
    displayContract,
  };
}
