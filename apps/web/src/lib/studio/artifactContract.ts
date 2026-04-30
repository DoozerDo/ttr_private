import type { ResumeModel } from "@/lib/resumeModel";
import { readResumeModel } from "@/lib/resumePreviewContract";
import {
  buildCoverLetterParagraphs,
  presentCoverLetterGeneration,
  presentResumeGeneration,
} from "@/src/lib/studio/helpers";
import { validateCoverLetterQuality, validateResumeQuality } from "@/src/lib/studio/artifactQuality";
import type { ArtifactGenerationResult } from "@shared/artifactGenerationResult";

export type StudioCoverLetterModel = {
  paragraphs: string[];
};

export type StudioArtifactContractInput = {
  resumeResponse: unknown;
  coverLetterResponse: unknown;
  canExportDocuments: boolean;
  isPro: boolean;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeResumeResponse(payload: unknown): unknown {
  const raw = toRecord(payload);
  if (!raw) return payload;

  const inner = toRecord(raw.payload);
  const candidate = inner ?? raw;

  const preview = toRecord(candidate.preview);
  const resumeFromPreview = preview ? toRecord(preview.resume) : null;
  if (resumeFromPreview) return candidate;

  const resumeFromPayload = toRecord(candidate.resume);
  if (!resumeFromPayload) return candidate;

  return {
    ...candidate,
    preview: { ...(preview ?? {}), resume: resumeFromPayload },
  };
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

export function buildStudioArtifactContract(input: StudioArtifactContractInput) {
  const normalizedResumeResponse = normalizeResumeResponse(input.resumeResponse);
  const normalizedCoverLetterResponse = normalizeCoverLetterResponse(input.coverLetterResponse);

  const resumeResult = toRecord(normalizedResumeResponse)?.resumeResult as ArtifactGenerationResult<unknown> | undefined;
  const coverLetterResult = toRecord(normalizedCoverLetterResponse)?.coverLetterResult as ArtifactGenerationResult<unknown> | undefined;

  const resumePresenter = presentResumeGeneration(normalizedResumeResponse);
  const coverPresenter = presentCoverLetterGeneration(normalizedCoverLetterResponse);

  const resumeModel: ResumeModel | null =
    resumeResult?.preview && typeof resumeResult.preview === "object"
      ? (resumeResult.preview as ResumeModel)
      : readResumeModel(normalizedResumeResponse);
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
  const coverLetterQuality = validateCoverLetterQuality(coverParagraphs);
  const hasUsableArtifacts =
    (Boolean(resumeModel) && resumeQuality.exportable) ||
    (Boolean(coverLetterModel) && coverLetterQuality.exportable);

  const hasResumeArtifact = resumePresenter.hasExportableContent || Boolean(resumeModel);
  const hasCoverLetterArtifact =
    coverPresenter.hasExportableContent ||
    Boolean(coverLetterResult?.preview) ||
    coverParagraphs.length > 0 ||
    Boolean(input.coverLetterResponse);

  const resumeExportAvailable =
    input.canExportDocuments &&
    input.isPro &&
    (resumeResult ? resumeResult.actions.canExport : resumePresenter.status === "success" && resumePresenter.hasExportableContent);
  const coverLetterExportAvailable =
    input.canExportDocuments &&
    input.isPro &&
    (coverLetterResult ? coverLetterResult.actions.canExport : coverPresenter.status === "success" && coverPresenter.hasExportableContent);

  return {
    hasResumeArtifact,
    hasCoverLetterArtifact,
    hasUsableArtifacts,
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
  };
}
