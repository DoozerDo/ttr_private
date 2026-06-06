import type { ResumeModel } from "@/lib/resumeModel";
import { estimateResumeModelBodyLength, readResumeModel } from "@/lib/resumePreviewContract";
import {
  buildCoverLetterParagraphs,
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
  const qs = String(artifact.qualityStatus ?? "").trim().toLowerCase();
  return qs === "failed";
}

function qualityGatePassSingle(gate: ReadinessArtifactLike["qualityGate"]): boolean {
  if (!gate || typeof gate !== "object") return false;
  return String((gate as any).status ?? "").trim() === "pass";
}

function isExportableSingleArtifact(artifact: ReadinessArtifactLike | null): boolean {
  if (!isPresentSingleArtifact(artifact)) return false;
  if (isFailedSingleArtifact(artifact)) return false;
  if (artifact.exportReady !== true) return false;
  return qualityGatePassSingle(artifact.qualityGate ?? null);
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

function normalizeResumeResponse(payload: unknown): unknown {
  const raw = toRecord(payload);
  if (!raw) return payload;

  const inner = toRecord(raw.payload);
  const candidate = inner ?? raw;

  // Intentionally do not upgrade legacy `candidate.resume` into `candidate.preview.resume` here.
  // Studio must render resume content only from the canonical `resumeResult.preview` contract.
  return candidate;
}

function normalizeCoverLetterResponse(payload: unknown): unknown {
  const raw = toRecord(payload);
  if (!raw) return payload;

  const inner = toRecord(raw.payload);
  const candidate = inner ?? raw;

  const preview = toRecord(candidate.preview);
  const coverFromPreview = preview ? toRecord(preview.coverLetter) : null;
  if (coverFromPreview) return candidate;

  const coverFromPayload = toRecord(candidate.coverLetter);
  if (!coverFromPayload) return candidate;

  return {
    ...candidate,
    preview: { ...(preview ?? {}), coverLetter: coverFromPayload },
  };
}

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptySectionText(sections: unknown): boolean {
  if (!Array.isArray(sections)) return false;
  return sections.some((section) => {
    if (!section || typeof section !== "object") return false;
    const record = section as Record<string, unknown>;
    return hasNonEmptyText(record.text) || hasNonEmptyText(record.content);
  });
}

function hasRenderableResumeContent(payload: unknown, model: ResumeModel | null): boolean {
  const record = toRecord(payload);
  const resumeResult = record ? toRecord(record.resumeResult) : null;
  const internal = record ? toRecord(record.internal) : null;
  const resumeInternal = resumeResult ? toRecord(resumeResult.internal) : null;
  const minimalIndicators = [
    internal?.minimalFallback,
    internal?.resumeFailSafeMinimalUsed,
    internal?.resumeGenerationMode,
    resumeInternal?.minimalFallback,
    resumeInternal?.resumeFailSafeMinimalUsed,
    resumeInternal?.resumeGenerationMode,
    record?.auditId,
    record?.audit_id,
    resumeResult?.auditId,
    resumeResult?.audit_id,
  ];
  const isMinimalFallback =
    minimalIndicators.some((value) => value === true || String(value ?? '').toLowerCase() === 'true') ||
    String(internal?.resumeGenerationMode ?? resumeInternal?.resumeGenerationMode ?? '').trim() === 'top_level_fail_safe_minimal' ||
    String(record?.auditId ?? record?.audit_id ?? resumeResult?.auditId ?? resumeResult?.audit_id ?? '').startsWith('minimal:');

  if (isMinimalFallback) return false;
  return Boolean(model && estimateResumeModelBodyLength(model) > 0);
}

function hasRenderableCoverLetterContent(payload: unknown, paragraphs: string[]): boolean {
  if (paragraphs.length > 0) return true;
  const record = toRecord(payload);
  if (!record) return false;
  if (hasNonEmptyText(record.content)) return true;
  if (hasNonEmptySectionText(record.sections)) return true;
  const preview = toRecord(record.preview);
  const coverPreview = preview ? toRecord(preview.coverLetter) : null;
  if (coverPreview) return true;
  const nestedCover = toRecord(record.coverLetter);
  if (nestedCover) return true;
  return false;
}

function legacyArtifactToReadinessArtifact(payload: unknown): ReadinessArtifactLike | null {
  const record = toRecord(payload);
  if (!record) return null;

  // Studio legacy responses sometimes nest under `payload`.
  const inner = toRecord(record.payload);
  const candidate = inner ?? record;

  const generationStatus = String(candidate.generationStatus ?? candidate.status ?? "").toLowerCase();
  const exportReady = candidate.exportReady === true;

  // Only upgrade legacy payloads that clearly indicate success + export readiness.
  // This is intentionally strict: missing/blocked artifacts must not become exportable.
  if (!(generationStatus === "success" && exportReady)) return null;

  return {
    generationState: "generated_usable",
    exportReady: true,
    qualityGate: { status: "pass", reasons: [] },
  };
}

export function buildStudioArtifactContract(input: StudioArtifactContractInput) {
  const normalizedResumeResponse = normalizeResumeResponse(input.resumeResponse);
  const normalizedCoverLetterResponse = normalizeCoverLetterResponse(input.coverLetterResponse);

  const resumeResult = toRecord(normalizedResumeResponse)?.resumeResult as ArtifactGenerationResult<unknown> | undefined;
  const coverLetterResult = toRecord(normalizedCoverLetterResponse)?.coverLetterResult as ArtifactGenerationResult<unknown> | undefined;

  const resumePresenter = presentResumeGeneration(
    resumeResult?.preview && typeof resumeResult.preview === "object"
      ? {
          ...(toRecord(normalizedResumeResponse) ?? {}),
          status: "success",
          generationStatus: "success",
          exportReady: resumeResult.exportReady === true,
          exports: resumeResult.exports ?? null,
          preview: { resume: resumeResult.preview },
        }
      : normalizedResumeResponse,
  );
  const coverPresenter = presentCoverLetterGeneration(normalizedCoverLetterResponse);

  const resumeModel: ResumeModel | null =
    resumeResult?.preview && typeof resumeResult.preview === "object"
      ? (resumeResult.preview as ResumeModel)
      : null;
  const coverParagraphs = (() => {
    const previewRecord = coverLetterResult?.preview && typeof coverLetterResult.preview === "object"
      ? (coverLetterResult.preview as Record<string, unknown>)
      : null;
    const paragraphs = previewRecord ? previewRecord.paragraphs : null;
    return Array.isArray(paragraphs) ? paragraphs.map((p) => String(p ?? "")).filter(Boolean) : buildCoverLetterParagraphs(normalizedCoverLetterResponse);
  })();
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

  const resumeReadinessArtifact =
    (resumeResult ?? legacyArtifactToReadinessArtifact(normalizedResumeResponse)) as ReadinessArtifactLike | null;
  const coverReadinessArtifact =
    (coverLetterResult ?? legacyArtifactToReadinessArtifact(normalizedCoverLetterResponse)) as ReadinessArtifactLike | null;

  const canonicalReadiness = resolveDocumentReadinessState({
    resumeArtifact: (resumeReadinessArtifact ?? null) as any,
    coverLetterArtifact: (coverReadinessArtifact ?? null) as any,
    critiqueResult: (input.critiqueResult as any) ?? null,
    qualityGate: null,
    exportReady: null,
    generationState: null,
  });

  const hasResumeArtifact = hasRenderableResumeContent(normalizedResumeResponse, resumeModel);
  const hasCoverLetterArtifact = hasRenderableCoverLetterContent(normalizedCoverLetterResponse, coverParagraphs);

  const resumeGenState = String((resumeResult as any)?.generationState ?? "").trim().toLowerCase();
  const coverGenState = String((coverLetterResult as any)?.generationState ?? "").trim().toLowerCase();
  const generationRunning = resumeGenState === "generating" || coverGenState === "generating";
  const generationFailed = isFailedSingleArtifact(resumeReadinessArtifact) || isFailedSingleArtifact(coverReadinessArtifact);
  const generationComplete = hasResumeArtifact && hasCoverLetterArtifact;
  const shouldAutoGenerateStart = !generationRunning && (!hasResumeArtifact || !hasCoverLetterArtifact);

  const displayContract: StudioArtifactDisplayContract = {
    resumePreviewRenderable: hasResumeArtifact,
    coverLetterPreviewRenderable: hasCoverLetterArtifact,
    generationRunning,
    generationFailed,
    generationComplete,
    shouldAutoGenerateStart,
  };

  const hasUsableArtifacts =
    hasReusableArtifacts ||
    (Boolean(resumeModel) && resumeQuality.exportable) ||
    (Boolean(coverLetterModel) && coverLetterQuality.exportable) ||
    hasResumeArtifact ||
    hasCoverLetterArtifact;

  const resumeExportAvailable =
    input.canExportDocuments && input.isPro && isExportableSingleArtifact(resumeReadinessArtifact);
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
    hasResumeArtifact,
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
      resumeResponse: normalizedResumeResponse,
      coverLetterResponse: normalizedCoverLetterResponse,
    },
    presenters: {
      resume: resumePresenter,
      coverLetter: coverPresenter,
    },
    displayContract,
  };
}
