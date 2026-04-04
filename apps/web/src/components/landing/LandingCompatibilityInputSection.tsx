"use client";

import { useCallback, useState } from "react";

import { RunYourAnalysisSection } from "@/src/components/landing/RunYourAnalysisSection";
import { defaultHeroJobDescription } from "@/src/data/heroPreview";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";

const LANDING_ANALYSIS_COUNTER_KEY = "ttr-landing-analysis-number";

export function LandingCompatibilityInputSection() {
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
        throw new Error("preview-request-failed");
      }

      const payload = (await response.json()) as { score?: unknown };
      const score = typeof payload?.score === "number" ? payload.score : null;
      if (score === null) {
        throw new Error("invalid-preview-score");
      }
      return score;
    },
    [],
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

      setPreviewError(null);
      setIsFinalPreviewLoading(true);

      let scoredValue: number;
      try {
        scoredValue = await requestPreviewScore(normalizedResumeText, nextJobDescription, "final-preview");
      } catch {
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
    [jobDescription, requestPreviewScore, resumeText],
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
