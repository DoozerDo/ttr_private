import type { ResumeModel } from "@/lib/resumeModel";
import { readResumeModel } from "@/lib/resumePreviewContract";
import {
  buildCoverLetterParagraphs,
  presentCoverLetterGeneration,
  presentResumeGeneration,
} from "@/src/lib/studio/helpers";
import { validateCoverLetterQuality, validateResumeQuality } from "@/src/lib/studio/artifactQuality";

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

  const resumePresenter = presentResumeGeneration(normalizedResumeResponse);
  const coverPresenter = presentCoverLetterGeneration(normalizedCoverLetterResponse);

  const resumeModel: ResumeModel | null = readResumeModel(normalizedResumeResponse);
  const coverParagraphs = buildCoverLetterParagraphs(normalizedCoverLetterResponse);
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
    coverPresenter.hasExportableContent || (coverParagraphs.length > 0 && Boolean(input.coverLetterResponse));

  const resumeExportAvailable =
    input.canExportDocuments &&
    input.isPro &&
    resumePresenter.status === "success" &&
    resumePresenter.hasExportableContent;
  const coverLetterExportAvailable =
    input.canExportDocuments &&
    input.isPro &&
    coverPresenter.status === "success" &&
    coverPresenter.hasExportableContent;

  return {
    hasResumeArtifact,
    hasCoverLetterArtifact,
    hasUsableArtifacts,
    resumeModel,
    coverLetterModel,
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
