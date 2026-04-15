"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RunYourAnalysisSection } from "@/src/components/landing/RunYourAnalysisSection";
import { defaultHeroJobDescription } from "@/src/data/heroPreview";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";

const LANDING_ANALYSIS_COUNTER_KEY = "ttr-landing-analysis-number";
const PREVIEW_DEBUG_FLAG = "debugCheckFit";

function sanitizeUnicodeForJsonTransport(value: string): string {
  // Replace lone surrogate code units with U+FFFD to avoid runtime failures when the
  // browser encodes request bodies (some environments throw during fetch dispatch).
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    const isHighSurrogate = codeUnit >= 0xd800 && codeUnit <= 0xdbff;
    const isLowSurrogate = codeUnit >= 0xdc00 && codeUnit <= 0xdfff;

    if (!isHighSurrogate && !isLowSurrogate) {
      output += value[index];
      continue;
    }

    if (isHighSurrogate) {
      const nextCodeUnit = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;
      const nextIsLowSurrogate = nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff;
      if (nextIsLowSurrogate) {
        output += value.slice(index, index + 2);
        index += 1;
        continue;
      }
      output += "\uFFFD";
      continue;
    }

    // Lone low surrogate.
    output += "\uFFFD";
  }
  return output;
}

function isPreviewDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return new URLSearchParams(window.location.search).get(PREVIEW_DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
}

type LandingCompatibilityStep =
  | "idle"
  | "file_selected"
  | "upload_started"
  | "upload_succeeded"
  | "upload_failed"
  | "preview_started"
  | "preview_succeeded"
  | "preview_failed"
  | "blocked_by_auth_bootstrap";

type LandingCompatibilityError = { code: string; message: string } | null;

export function LandingCompatibilityInputSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [jobDescription, setJobDescription] = useState("");
  const [isFinalPreviewLoading, setIsFinalPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewScore, setPreviewScore] = useState<number | null>(null);
  const [previewScoreBand, setPreviewScoreBand] = useState<"TOP" | "MID" | "LOW" | null>(null);
  const [lastStep, setLastStep] = useState<LandingCompatibilityStep>("idle");
  const [uploadRequestStartedAt, setUploadRequestStartedAt] = useState<string | null>(null);
  const [uploadRequestFinishedAt, setUploadRequestFinishedAt] = useState<string | null>(null);
  const [previewRequestStartedAt, setPreviewRequestStartedAt] = useState<string | null>(null);
  const [previewRequestFinishedAt, setPreviewRequestFinishedAt] = useState<string | null>(null);
  const [authBootstrapAttempted, setAuthBootstrapAttempted] = useState(false);
  const [authBootstrapFailed, setAuthBootstrapFailed] = useState(false);
  const [lastError, setLastError] = useState<LandingCompatibilityError>(null);
  const jdReady = jobDescription.trim().length > 120;

  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent).detail as { stage?: string } | undefined;
      if (!payload || typeof payload !== "object") {
        return;
      }
      if (payload.stage === "attempted") {
        setAuthBootstrapAttempted(true);
      }
      if (payload.stage === "failed") {
        setAuthBootstrapFailed(true);
        setLastStep((current) => (current === "blocked_by_auth_bootstrap" ? current : "blocked_by_auth_bootstrap"));
      }
    };

    window.addEventListener("ttr:auth-bootstrap", handler);
    return () => window.removeEventListener("ttr:auth-bootstrap", handler);
  }, []);

  const analyticsOptions = useMemo(
    () => ({
      allowUserLookup: isAuthenticated,
      userId: null as string | null,
    }),
    [isAuthenticated],
  );

  const handleResumeUploadInitiated = useCallback(() => {
    trackEvent("resume_upload_initiated", {
      source: "landing",
    }, analyticsOptions);
  }, [analyticsOptions]);

  const handleResumeFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    setLastError(null);
    setLastStep("file_selected");
    setResumeFilename(file.name);
    setLastStep("upload_started");
    setUploadRequestStartedAt(new Date().toISOString());

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/preview/extract-resume-text", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const snippet = await response.text().catch(() => "");
        throw new Error(`resume-extract-failed status=${response.status} ${snippet.slice(0, 120)}`);
      }

      const payload = (await response.json()) as { resumeText?: unknown };
      const extracted = typeof payload?.resumeText === "string" ? payload.resumeText.trim() : "";
      setResumeText(extracted);
      setUploadRequestFinishedAt(new Date().toISOString());
      setLastStep("upload_succeeded");
    } catch (error) {
      setResumeText("");
      setUploadRequestFinishedAt(new Date().toISOString());
      setLastStep("upload_failed");
      setLastError({
        code: "resume_extract_failed",
        message: error instanceof Error ? error.message : "Unable to extract resume text.",
      });
    }

    trackEvent("resume_upload_completed", {
      source: "landing",
      fileType: file.type || "unknown",
    }, analyticsOptions);
  }, [analyticsOptions]);

  const handleJobDescriptionChange = useCallback((nextValue: string) => {
    setJobDescription(nextValue);
  }, []);

  const handleJobDescriptionFocus = useCallback(() => {
    trackEvent("job_description_focused", {
      source: "landing",
    }, analyticsOptions);
  }, [analyticsOptions]);

  const requestCanonicalFitScore = useCallback(
    async (nextResumeText: string, nextJobDescription: string): Promise<{
      score: number;
      scoreBand: "TOP" | "MID" | "LOW";
    }> => {
      const debug = isPreviewDebugEnabled();
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

      const normalizedResumeText = sanitizeUnicodeForJsonTransport(nextResumeText.trim());
      const normalizedJobDescriptionText = sanitizeUnicodeForJsonTransport(nextJobDescription.trim());

      const totalChars = normalizedResumeText.length + normalizedJobDescriptionText.length;

      const body = JSON.stringify({
        ...(normalizedResumeText ? { resumeText: normalizedResumeText } : {}),
        jobDescriptionText: normalizedJobDescriptionText,
      });

      if (debug) {
        console.info("[landing-checkfit] dispatch canonical fit score request", {
          isAuthenticated,
          hasResume: Boolean(normalizedResumeText),
          resumeLength: normalizedResumeText.length,
          jobDescriptionLength: normalizedJobDescriptionText.length,
          totalChars,
        });
      }

      let response: Response;
      try {
        response = await fetch("/api/preview/canonical-fit-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (error) {
        console.error("[landing-checkfit] canonical request dispatch failed", error);
        throw error;
      }

      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        const elapsedMs =
          typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : undefined;
        if (debug) {
          console.info("[landing-checkfit] canonical non-2xx", {
            isAuthenticated,
            status: response.status,
            elapsedMs,
            contentType: response.headers.get("content-type") ?? "unknown",
            snippet: raw.slice(0, 280),
          });
        }
        throw new Error(`canonical-fit-score-failed status=${response.status}`);
      }

      const payload = (await response.json()) as { score?: unknown; scoreBand?: unknown };
      const score = typeof payload?.score === "number" ? payload.score : null;
      const scoreBand =
        payload?.scoreBand === "TOP" || payload?.scoreBand === "MID" || payload?.scoreBand === "LOW"
          ? payload.scoreBand
          : null;
      if (score === null || scoreBand === null) {
        if (debug) {
          console.info("[landing-checkfit] canonical invalid payload", {
            isAuthenticated,
            scoreType: typeof (payload as any)?.score,
            scoreBand: (payload as any)?.scoreBand,
          });
        }
        throw new Error("invalid-canonical-fit-score");
      }
      return { score, scoreBand };
    },
    [isAuthenticated],
  );

  const handleAnalyzeCompatibility = useCallback(
    async (jobDescriptionOverride?: string) => {
      const nextJobDescription =
        (jobDescriptionOverride ?? jobDescription).trim() || defaultHeroJobDescription;
      const normalizedResumeText = resumeText.trim();
      const hasResume = normalizedResumeText.length > 0;

      const analysisNumber = (() => {
        if (typeof window === "undefined") {
          return 1;
        }
        try {
          const raw = window.sessionStorage.getItem(LANDING_ANALYSIS_COUNTER_KEY);
          const current = raw ? Number(raw) : 0;
          const next = Number.isFinite(current) && current > 0 ? Math.floor(current) + 1 : 1;
          window.sessionStorage.setItem(LANDING_ANALYSIS_COUNTER_KEY, String(next));
          return next;
        } catch {
          return 1;
        }
      })();

      trackEvent("compatibility_analysis_started", {
        source: "landing",
        jobDescriptionLength: nextJobDescription.length,
        hasResume,
        analysisNumber,
      }, analyticsOptions);
      if (isPreviewDebugEnabled()) {
        console.info("[landing-checkfit] click", {
          isAuthenticated,
          hasResume,
          jobDescriptionLength: nextJobDescription.length,
          resumeLength: normalizedResumeText.length,
          analysisNumber,
        });
      }

      setPreviewError(null);
      setPreviewScore(null);
      setPreviewScoreBand(null);
      setIsFinalPreviewLoading(true);
      setLastError(null);
      setLastStep("preview_started");
      setPreviewRequestStartedAt(new Date().toISOString());

      let scoredValue: number;
      let scoredBand: "TOP" | "MID" | "LOW";
      try {
        const result = await requestCanonicalFitScore(normalizedResumeText, nextJobDescription);
        scoredValue = result.score;
        scoredBand = result.scoreBand;
      } catch (error) {
        setPreviewRequestFinishedAt(new Date().toISOString());
        setLastStep("preview_failed");
        setLastError({
          code: "preview_request_failed",
          message: error instanceof Error ? error.message : "Preview request failed.",
        });
        if (isPreviewDebugEnabled()) {
          console.info("[landing-checkfit] preview request failed", {
            isAuthenticated,
            analysisNumber,
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          });
        }
        setPreviewError("Preview is temporarily unavailable. Please try again.");
        setIsFinalPreviewLoading(false);
        return;
      }

      setJobDescription(nextJobDescription);
      setIsFinalPreviewLoading(false);
      setPreviewScore(scoredValue);
      setPreviewScoreBand(scoredBand);
      setPreviewRequestFinishedAt(new Date().toISOString());
      setLastStep("preview_succeeded");
      trackEvent("compatibility_analysis_completed", {
        source: "landing",
        score: scoredValue,
        scoreBucket: resolveScoreBucket(scoredValue),
      }, analyticsOptions);
    },
    [analyticsOptions, isAuthenticated, jobDescription, requestCanonicalFitScore, resumeText],
  );

  return (
    <RunYourAnalysisSection
      jobDescription={jobDescription}
      onJobDescriptionChange={handleJobDescriptionChange}
      onJobDescriptionFocus={handleJobDescriptionFocus}
      resumeFilename={resumeFilename}
      onResumeUploadInitiated={handleResumeUploadInitiated}
      onResumeFileSelected={handleResumeFileSelected}
      onAnalyzeCompatibility={handleAnalyzeCompatibility}
      isPreviewLoading={isFinalPreviewLoading}
      jdReady={jdReady}
      previewError={previewError}
      previewScore={previewScore}
      previewScoreBucket={previewScoreBand}
      debugState={{
        lastStep,
        resumeFilename,
        uploadRequestStartedAt,
        uploadRequestFinishedAt,
        previewRequestStartedAt,
        previewRequestFinishedAt,
        authBootstrapAttempted,
        authBootstrapFailed,
        lastError,
      }}
    />
  );
}
