"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { RunYourAnalysisSection } from "@/src/components/landing/RunYourAnalysisSection";
import { defaultHeroJobDescription } from "@/src/data/heroPreview";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";

const LANDING_ANALYSIS_COUNTER_KEY = "ttr-landing-analysis-number";
const PREVIEW_MAX_TOTAL_CHARS = 100_000;
const PREVIEW_DEBUG_FLAG = "debugCheckFit";

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

async function readFileText(file: File): Promise<string> {
  const candidate = file as File & { text?: () => Promise<string> };
  if (typeof candidate.text === "function") {
    return await candidate.text();
  }

  // JSDOM does not implement File.text() consistently; fall back to FileReader.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("file-read-failed"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

export function LandingCompatibilityInputSection({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [jobDescription, setJobDescription] = useState("");
  const [isFinalPreviewLoading, setIsFinalPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const jdReady = jobDescription.trim().length > 120;

  const handleResumeUploadInitiated = useCallback(() => {
    trackEvent("resume_upload_initiated", {
      source: "landing",
    });
  }, []);

  const handleResumeFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    setResumeFilename(file.name);
    const extractedText = (await readFileText(file).catch(() => "")).trim();
    setResumeText(extractedText);
    trackEvent("resume_upload_completed", {
      source: "landing",
      fileType: file.type || "unknown",
    });
  }, []);

  const handleJobDescriptionChange = useCallback((nextValue: string) => {
    setJobDescription(nextValue);
  }, []);

  const handleJobDescriptionFocus = useCallback(() => {
    trackEvent("job_description_focused", {
      source: "landing",
    });
  }, []);

  const requestPreviewScore = useCallback(
    async (
      nextResumeText: string,
      nextJobDescription: string,
      mode: "live-preview" | "final-preview",
    ): Promise<number> => {
      const debug = isPreviewDebugEnabled();
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

      const normalizedResumeText = nextResumeText.trim();
      const normalizedJobDescriptionText = nextJobDescription.trim();

      // The API enforces a total character limit; protect the client from constructing
      // overly large request bodies (which can fail before dispatch in some browsers).
      const totalChars = normalizedResumeText.length + normalizedJobDescriptionText.length;
      const resumeBudget = Math.max(0, PREVIEW_MAX_TOTAL_CHARS - normalizedJobDescriptionText.length);
      const cappedResumeText =
        normalizedResumeText.length > resumeBudget
          ? normalizedResumeText.slice(0, resumeBudget)
          : normalizedResumeText;

      let body: string;
      try {
        body = JSON.stringify({
          ...(cappedResumeText ? { resumeText: cappedResumeText } : {}),
          jobDescriptionText: normalizedJobDescriptionText,
          mode,
        });
      } catch (error) {
        if (debug) {
          console.info("[landing-checkfit] failed to serialize request body", {
            isAuthenticated,
            mode,
            resumeLength: normalizedResumeText.length,
            jobDescriptionLength: normalizedJobDescriptionText.length,
            totalChars,
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          });
        }
        // Fall back to JD-only preview instead of silently no-op'ing.
        body = JSON.stringify({
          jobDescriptionText: normalizedJobDescriptionText,
          mode,
        });
      }

      if (debug && totalChars > PREVIEW_MAX_TOTAL_CHARS) {
        console.info("[landing-checkfit] payload capped to API limit", {
          isAuthenticated,
          mode,
          resumeLength: normalizedResumeText.length,
          resumeBudget,
          cappedResumeLength: cappedResumeText.length,
          jobDescriptionLength: normalizedJobDescriptionText.length,
          totalChars,
        });
      }

      const response = await fetch("/api/preview/compatibility-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        const elapsedMs =
          typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : undefined;
        if (debug) {
          console.info("[landing-checkfit] preview non-2xx", {
            isAuthenticated,
            mode,
            status: response.status,
            elapsedMs,
            contentType: response.headers.get("content-type") ?? "unknown",
            snippet: raw.slice(0, 280),
          });
        }
        throw new Error(`preview-request-failed status=${response.status}`);
      }

      const payload = (await response.json()) as { score?: unknown };
      const score = typeof payload?.score === "number" ? payload.score : null;
      if (score === null) {
        if (debug) {
          console.info("[landing-checkfit] preview invalid payload", {
            isAuthenticated,
            mode,
            scoreType: typeof (payload as any)?.score,
          });
        }
        throw new Error("invalid-preview-score");
      }
      return score;
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
      });
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
      setIsFinalPreviewLoading(true);

      let scoredValue: number;
      try {
        scoredValue = await requestPreviewScore(normalizedResumeText, nextJobDescription, "final-preview");
      } catch (error) {
        if (isPreviewDebugEnabled()) {
          console.info("[landing-checkfit] preview request failed", {
            isAuthenticated,
            analysisNumber,
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
          });
        }
        if (!isAuthenticated) {
          router.push(`/auth/signup?next=${encodeURIComponent("/baseline")}`);
          setIsFinalPreviewLoading(false);
          return;
        }

        setPreviewError("Preview is temporarily unavailable. Please try again.");
        setIsFinalPreviewLoading(false);
        return;
      }

      setJobDescription(nextJobDescription);
      setIsFinalPreviewLoading(false);
      trackEvent("compatibility_analysis_completed", {
        source: "landing",
        score: scoredValue,
        scoreBucket: resolveScoreBucket(scoredValue),
      });
    },
    [isAuthenticated, jobDescription, requestPreviewScore, resumeText, router],
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
    />
  );
}
