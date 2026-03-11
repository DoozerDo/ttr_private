"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HeroAnalysisConsole } from "@/src/components/landing/HeroAnalysisConsole";
import {
  defaultHeroJobDescription,
  getHeroScenarioForComparison,
} from "@/src/data/heroPreview";
import { resolveScoreBucket, trackEvent } from "@/src/lib/analytics";

type LandingHeroProps = {
  isAuthenticated: boolean;
};

const jobDescriptionPlaceholders = [
  "Paste the target job description here.",
  "Include responsibilities, tools, and seniority expectations.",
  "Add the full role summary for best comparison quality.",
] as const;

type ActiveComparisonInput = {
  jobDescription: string;
  hasResume: boolean;
  score: number | null;
};

const CLIENT_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "your",
  "will",
  "you",
  "are",
  "our",
  "their",
  "has",
  "had",
  "its",
  "was",
  "were",
  "not",
  "but",
  "about",
  "into",
  "than",
  "then",
  "they",
  "them",
  "his",
  "her",
  "she",
  "him",
  "who",
  "what",
  "when",
  "where",
  "how",
  "any",
  "all",
  "can",
  "may",
  "per",
  "via",
  "use",
  "using",
  "used",
  "role",
  "job",
  "description",
]);

function tokenizeEstimate(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !CLIENT_STOPWORDS.has(token));
}

function computeInstantEstimateScore(resumeText: string, jobDescriptionText: string): number | null {
  const normalizedResume = resumeText.trim();
  const jobTokens = Array.from(new Set(tokenizeEstimate(jobDescriptionText))).slice(0, 30);
  if (!jobTokens.length) {
    return null;
  }

  if (!normalizedResume) {
    const specificity = jobTokens.length / 30;
    const jobOnlyEstimate = 42 + specificity * 28;
    return Math.round(Math.min(85, Math.max(42, jobOnlyEstimate)));
  }

  const resumeTokens = new Set(tokenizeEstimate(normalizedResume));
  if (!resumeTokens.size) {
    return 42;
  }

  const overlap = jobTokens.filter((token) => resumeTokens.has(token)).length;
  const ratio = overlap / jobTokens.length;
  const raw = ratio * 100;
  return Math.round(Math.min(85, Math.max(42, raw)));
}

export function LandingHero({ isAuthenticated }: LandingHeroProps) {
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [jobDescription, setJobDescription] = useState(defaultHeroJobDescription);
  const [runId, setRunId] = useState(0);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [analysisActive, setAnalysisActive] = useState(false);
  const [isLivePreviewLoading, setIsLivePreviewLoading] = useState(false);
  const [isFinalPreviewLoading, setIsFinalPreviewLoading] = useState(false);
  const [hasUserTriggeredAnalysis, setHasUserTriggeredAnalysis] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activeComparison, setActiveComparison] = useState<ActiveComparisonInput>({
    jobDescription: defaultHeroJobDescription,
    hasResume: false,
    score: null,
  });

  const consoleRef = useRef<HTMLDivElement | null>(null);
  const hasTrackedJobDescriptionFocusRef = useRef(false);
  const livePreviewRequestRef = useRef(0);

  const scenario = useMemo(
    () =>
      getHeroScenarioForComparison({
        jobDescription: activeComparison.jobDescription,
        hasResume: activeComparison.hasResume,
        scoreOverride: activeComparison.score,
      }),
    [activeComparison],
  );

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
    if (hasTrackedJobDescriptionFocusRef.current) return;
    hasTrackedJobDescriptionFocusRef.current = true;
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

      trackEvent("compatibility_analysis_started", {
        source: "landing",
        jobDescriptionLength: nextJobDescription.length,
        hasResume,
      });

      setPreviewError(null);
      setIsFinalPreviewLoading(true);
      setAnalysisActive(true);

      let scoredValue: number;
      try {
        scoredValue = await requestPreviewScore(normalizedResumeText, nextJobDescription, "final-preview");
      } catch {
        setPreviewError("Preview is temporarily unavailable. Please try again.");
        setIsFinalPreviewLoading(false);
        setAnalysisActive(false);
        return;
      }

      setJobDescription(nextJobDescription);
      setActiveComparison({
        jobDescription: nextJobDescription,
        hasResume,
        score: scoredValue,
      });
      setRunId((previous) => previous + 1);
      setHasUserTriggeredAnalysis(true);
      setPlaceholderIndex((previous) => (previous + 1) % jobDescriptionPlaceholders.length);
      setIsFinalPreviewLoading(false);
      trackEvent("compatibility_analysis_completed", {
        source: "landing",
        score: scoredValue,
        scoreBucket: resolveScoreBucket(scoredValue),
      });

      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        window.setTimeout(() => {
          consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
      }

      window.setTimeout(() => {
        setAnalysisActive(false);
      }, 800);
    },
    [jobDescription, requestPreviewScore, resumeText],
  );

  useEffect(() => {
    if (!analysisActive) {
      document.body.style.overflow = "";
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [analysisActive]);

  const handleAnalyzeAnotherComparison = useCallback(() => {
    setJobDescription("");
    setPreviewError(null);
    setPlaceholderIndex((previous) => (previous + 1) % jobDescriptionPlaceholders.length);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const handleExampleJobDescriptionClick = useCallback(
    (nextJobDescription: string) => {
      handleAnalyzeCompatibility(nextJobDescription);
    },
    [handleAnalyzeCompatibility],
  );

  useEffect(() => {
    const normalizedResumeText = resumeText.trim();
    const nextJobDescription = (jobDescription || "").trim();
    const hasResume = normalizedResumeText.length > 0;

    const estimatedScore = computeInstantEstimateScore(normalizedResumeText, nextJobDescription);
    setActiveComparison({
      jobDescription: nextJobDescription || defaultHeroJobDescription,
      hasResume,
      score: estimatedScore,
    });

    if (!nextJobDescription) {
      setIsLivePreviewLoading(false);
      return;
    }

    const requestId = livePreviewRequestRef.current + 1;
    livePreviewRequestRef.current = requestId;
    setIsLivePreviewLoading(true);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const score = await requestPreviewScore(normalizedResumeText, nextJobDescription, "live-preview");
          if (livePreviewRequestRef.current !== requestId) {
            return;
          }
          setPreviewError(null);
          setActiveComparison({
            jobDescription: nextJobDescription,
            hasResume: true,
            score,
          });
        } catch {
          if (livePreviewRequestRef.current !== requestId) {
            return;
          }
          setPreviewError("Preview is temporarily unavailable. Please try again.");
        } finally {
          if (livePreviewRequestRef.current === requestId) {
            setIsLivePreviewLoading(false);
          }
        }
      })();
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [jobDescription, requestPreviewScore, resumeText]);

  return (
    <section id="product" className="relative overflow-hidden border-b border-slate-800/70">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-slate-400/5 to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-[96rem] px-4 py-7 lg:px-6 lg:py-8">
        <div className="rounded-3xl border border-slate-700/90 bg-slate-950/65 p-5 shadow-[0_0_0_1px_rgba(148,163,184,0.12)_inset] lg:p-6">
          <div
            className={`mb-4 space-y-2 transition-opacity duration-200 lg:mb-5 ${
              analysisActive ? "opacity-60" : "opacity-100"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Career Intelligence</p>
            <h1 className="mx-auto max-w-[900px] text-4xl font-semibold leading-tight text-white lg:text-5xl xl:text-6xl">
              Know if you actually qualify before you apply
            </h1>
            <p className="mx-auto max-w-[900px] text-base leading-relaxed text-slate-300 lg:text-[1.05rem]">
              Upload your resume and compare it to any job description. Target This Role shows your compatibility
              score, strengths, and gaps without inflating your experience.
            </p>
          </div>

          <div
            ref={consoleRef}
            className={`transition-all duration-200 ${
              analysisActive ? "ring-1 ring-slate-500/60 ring-offset-0" : ""
            }`}
          >
            <HeroAnalysisConsole
              resumeFilename={resumeFilename}
              onResumeUploadInitiated={handleResumeUploadInitiated}
              onResumeFileSelected={handleResumeFileSelected}
              jobDescription={jobDescription}
              onJobDescriptionChange={handleJobDescriptionChange}
              onJobDescriptionFocus={handleJobDescriptionFocus}
              onAnalyzeCompatibility={handleAnalyzeCompatibility}
              onExampleJobDescriptionClick={handleExampleJobDescriptionClick}
              onAnalyzeAnotherComparison={handleAnalyzeAnotherComparison}
              placeholder={jobDescriptionPlaceholders[placeholderIndex]}
              scenario={scenario}
              runId={runId}
              isAuthenticated={isAuthenticated}
              hasUserTriggeredAnalysis={hasUserTriggeredAnalysis}
              isPreviewLoading={isFinalPreviewLoading}
              isScoring={isLivePreviewLoading || isFinalPreviewLoading}
            />
          </div>
          {previewError ? <p className="mt-2 text-xs text-rose-300">{previewError}</p> : null}

          <div
            className={`mt-3.5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/45 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300 transition-opacity duration-200 ${
              analysisActive ? "opacity-70" : "opacity-100"
            }`}
          >
            {(analysisActive
              ? ["Resume parsed", "JD mapped", "Score resolved", "Gap paths ready"]
              : ["Verified baseline required", "Compatibility engine", "Opportunity model", "Truth guard"]
            ).map((label) => (
              <span
                key={label}
                className={`rounded-full border px-2.5 py-1 ${
                  analysisActive
                    ? "border-emerald-300/35 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-700/80 bg-slate-950/45 text-slate-300"
                }`}
              >
                {label}
              </span>
            ))}
          </div>

          <div
            className={`mt-2.5 grid gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/45 p-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300 transition-opacity duration-200 sm:grid-cols-3 ${
              analysisActive ? "opacity-55" : "opacity-100"
            }`}
          >
            <p className="rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2 text-center">
              Verified experience only
            </p>
            <p className="rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2 text-center">
              No fabricated metrics
            </p>
            <p className="rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2 text-center">
              No inflated scope
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
