import type { ResumeModel } from "@/lib/resumeModel";
import {
  estimateResumeModelBodyLength,
  readResumeModel,
  RESULTS_RESUME_PREVIEW_LIMITS,
  sliceResumeModelForPreview,
} from "@/lib/resumePreviewContract";
import { truncateForPreview } from "@/lib/previewTruncation";

export type ResultsResumePreviewSelection =
  | {
      renderer: "bounded_structured_preview";
      previewModel: ResumeModel;
      previewText: null;
      previewLength: number;
      totalBodyLength: number;
      truncated: boolean;
      reason: "completed_generation";
    }
  | {
      renderer: "bounded_text_preview";
      previewModel: null;
      previewText: string;
      previewLength: number;
      totalBodyLength: number;
      truncated: boolean;
      reason: "unparseable_payload_fallback_text";
    }
  | {
      renderer: "none";
      previewModel: null;
      previewText: null;
      previewLength: 0;
      totalBodyLength: 0;
      truncated: false;
      reason: "unparseable_payload_no_fallback";
    };

function readLooseTextFallback(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.previewText,
    record.preview_text,
    record.text,
    record.rawText,
    record.raw_text,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

export function selectResultsResumePreview(payload: unknown): ResultsResumePreviewSelection {
  const fullModel = readResumeModel(payload);
  if (fullModel) {
    const totalBodyLength = estimateResumeModelBodyLength(fullModel);
    const sliced = sliceResumeModelForPreview(fullModel, RESULTS_RESUME_PREVIEW_LIMITS);
    const previewLength = estimateResumeModelBodyLength(sliced.model);
    return {
      renderer: "bounded_structured_preview",
      previewModel: sliced.model,
      previewText: null,
      previewLength,
      totalBodyLength,
      truncated: sliced.truncated,
      reason: "completed_generation",
    };
  }

  const fallback = readLooseTextFallback(payload);
  if (!fallback) {
    return {
      renderer: "none",
      previewModel: null,
      previewText: null,
      previewLength: 0,
      totalBodyLength: 0,
      truncated: false,
      reason: "unparseable_payload_no_fallback",
    };
  }

  const preview = truncateForPreview(fallback, { maxChars: 1200, maxLines: 60 });
  return {
    renderer: "bounded_text_preview",
    previewModel: null,
    previewText: preview.text,
    previewLength: preview.previewLength,
    totalBodyLength: preview.totalLength,
    truncated: preview.truncated,
    reason: "unparseable_payload_fallback_text",
  };
}
