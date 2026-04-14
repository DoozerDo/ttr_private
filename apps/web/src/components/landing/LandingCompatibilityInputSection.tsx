"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { RunYourAnalysisSection } from "@/src/components/landing/RunYourAnalysisSection";
import { defaultHeroJobDescription } from "@/src/data/heroPreview";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";

const LANDING_ANALYSIS_COUNTER_KEY = "ttr-landing-analysis-number";

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
    const extractedText = (await file.text().catch(() => "")).trim();
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
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const response = await fetch("/api/preview/compatibility-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(nextResumeText ? { resumeText: nextResumeText } : {}),
          jobDescriptionText: nextJobDescription,
          mode,
        }),
      });

      if (!response.ok) {
        const raw = await response.text().catch(() => "");
        const elapsedMs =
          typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : undefined;
        console.info("[landing-checkfit] preview non-2xx", {
          isAuthenticated,
          mode,
          status: response.status,
          elapsedMs,
          contentType: response.headers.get("content-type") ?? "unknown",
          snippet: raw.slice(0, 280),
        });
        throw new Error(`preview-request-failed status=${response.status}`);
      }

      const payload = (await response.json()) as { score?: unknown };
      const score = typeof payload?.score === "number" ? payload.score : null;
      if (score === null) {
        console.info("[landing-checkfit] preview invalid payload", {
          isAuthenticated,
          mode,
          scoreType: typeof (payload as any)?.score,
        });
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
      console.info("[landing-checkfit] click", {
        isAuthenticated,
        hasResume,
        jobDescriptionLength: nextJobDescription.length,
        resumeLength: normalizedResumeText.length,
        analysisNumber,
      });

      setPreviewError(null);
      setIsFinalPreviewLoading(true);

      let scoredValue: number;
      try {
        console.info("[landing-checkfit] dispatch preview request", { isAuthenticated, analysisNumber });
        scoredValue = await requestPreviewScore(normalizedResumeText, nextJobDescription, "final-preview");
      } catch (error) {
        console.info("[landing-checkfit] preview request failed", {
          isAuthenticated,
          analysisNumber,
          error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
        });
        if (!isAuthenticated) {
          console.info("[landing-checkfit] redirect branch=signup_on_preview_failure", { analysisNumber });
          router.push(`/auth/signup?next=${encodeURIComponent("/baseline")}`);
          setIsFinalPreviewLoading(false);
          return;
        }

        console.info("[landing-checkfit] branch=show_preview_error", { analysisNumber });
        setPreviewError("Preview is temporarily unavailable. Please try again.");
        setIsFinalPreviewLoading(false);
        return;
      }

      setJobDescription(nextJobDescription);
      setIsFinalPreviewLoading(false);
      console.info("[landing-checkfit] preview success", { isAuthenticated, analysisNumber, score: scoredValue });
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
