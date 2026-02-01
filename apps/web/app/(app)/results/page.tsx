"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import {
  ComplianceFlagPanel,
  ComplianceViolationPanel,
  type ComplianceFlag,
} from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TextInput } from "@/components/TextInput";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { useAutoGenerateThreshold } from "../lib/settings";
import { getVerdictDisplayOrDefault } from "@/lib/fit-verdict";
import {
  buildReasonSummary,
  mapComplianceFlags,
  sortComplianceFlagsBySeverity,
} from "@/lib/resultsInsights";
import {
  CALIBRATION_PROFILE_OPTIONS,
  type CalibrationProfile,
} from "@/lib/calibration/profiles";

type FitDimensionScores = {
  experienceAlignment?: number;
  leadershipLevel?: number;
  technicalPlatformFit?: number;
  industryContext?: number;
  strategicTacticalFit?: number;
};

type DimensionBreakdown = {
  experience_alignment?: number;
  leadership_level?: number;
  technical_platform_fit?: number;
  industry_context?: number;
  strategic_vs_tactical?: number;
};

type LatestAnalysis = {
  baselineId: string;
  baselineVersion?: number | null;
  baselineVersionId?: string | null;
  baselineVersionHash?: string | null;
  jobId: string;
  overallScore?: number;
  note?: string;
  verdict?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  assessmentId?: string | null;
  score?: number | null;
  auditId?: string | null;
  audit_id?: string | null;
  dimensionScores?: FitDimensionScores | null;
  expandedDimensionScores?: FitDimensionScores | null;
  breakdown?: DimensionBreakdown | null;
  strengths?: string[];
  gaps?: string[];
  complianceFlags?: string[];
  summary?: string | null;
  createdAt?: string | null;
};

type CalibrationMetadata = {
  profile: CalibrationProfile;
  label: string;
  delta: number;
};

type CalibratedResult = LatestAnalysis & {
  calibration?: CalibrationMetadata;
};

type NextStep = {
  title: string;
  description: string;
};

type NextStepArgs = {
  score: number | null | undefined;
  verdict?: string | null;
  hasAnalysis: boolean;
  autoGenerateThreshold: number;
};

const debugUiEnabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";

const DIMENSION_LABELS: Record<keyof FitDimensionScores, string> = {
  experienceAlignment: "Experience alignment",
  leadershipLevel: "Leadership level",
  technicalPlatformFit: "Technical platform fit",
  industryContext: "Industry & context",
  strategicTacticalFit: "Strategic vs tactical",
};

function normalizeDimensionScores(data?: LatestAnalysis | null): FitDimensionScores {
  if (!data) return {};
  if (data.dimensionScores) return data.dimensionScores;
  if (data.breakdown) {
    const breakdown = data.breakdown;
    return {
      experienceAlignment: breakdown.experience_alignment,
      leadershipLevel: breakdown.leadership_level,
      technicalPlatformFit: breakdown.technical_platform_fit,
      industryContext: breakdown.industry_context,
      strategicTacticalFit: breakdown.strategic_vs_tactical,
    };
  }

  const fallback = data as Record<string, unknown>;
  if (fallback.dimension_scores && typeof fallback.dimension_scores === "object") {
    const scores = fallback.dimension_scores as Record<string, unknown>;
    return {
      experienceAlignment:
        typeof scores.experience_alignment === "number" ? scores.experience_alignment : undefined,
      leadershipLevel: typeof scores.leadership_level === "number" ? scores.leadership_level : undefined,
      technicalPlatformFit:
        typeof scores.technical_platform_fit === "number" ? scores.technical_platform_fit : undefined,
      industryContext: typeof scores.industry_context === "number" ? scores.industry_context : undefined,
      strategicTacticalFit:
        typeof scores.strategic_vs_tactical === "number" ? scores.strategic_vs_tactical : undefined,
    };
  }

  return {};
}

const getNextSteps = ({
  score,
  verdict,
  hasAnalysis,
  autoGenerateThreshold,
}: NextStepArgs): NextStep[] => {
  const verdictInfo = getVerdictDisplayOrDefault(verdict);
  const scoreLabel = typeof score === "number" ? score.toFixed(1) : "pending";

  return [
    {
      title: "Understand this verdict",
      description: hasAnalysis
        ? `Review the strengths, gaps, and dimension contributions above to see how we landed on the ${verdictInfo.label.toLowerCase()} verdict (${scoreLabel}).`
        : "Load the latest analysis to reveal the verdict and supporting context.",
    },
    {
      title: "Decide whether to apply",
      description:
        "Weigh the highlighted gaps against the role priorities and your timing, and open Fit Review if you want deeper context before moving forward.",
    },
    {
      title: "Generate or polish a resume",
      description: `Open the Studio to generate a draft, copy the text, or download documents. Exports remain available anytime, regardless of score.`,
    },
    {
      title: "Apply and log the progress",
      description: "Capture the opportunity in your tracker, confirm next steps, and secure the application window.",
    },
    {
      title: "Prepare for interviews",
      description: "Once you've decided to apply, leverage the Interview Toolkit to practice around the gaps exposed above.",
    },
  ];
};

type AnyObject = Record<string, unknown>;

function resolveUnknownMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { message?: unknown; error?: unknown };
  if (typeof candidate.message === "string" && candidate.message.length) {
    return candidate.message;
  }
  if (typeof candidate.error === "string" && candidate.error.length) {
    return candidate.error;
  }
  return undefined;
}

function stripInternalKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInternalKeys);

  if (value && typeof value === "object") {
    const obj = value as AnyObject;
    const out: AnyObject = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = k.toLowerCase();

      const looksInternal =
        key.includes("audit") ||
        key.includes("hash") ||
        key === "jobid" ||
        key === "baselineid" ||
        key === "baselineversionid" ||
        key.endsWith("_id") ||
        key === "id";

      if (looksInternal) continue;

      out[k] = stripInternalKeys(v);
    }
    return out;
  }

  return value;
}

function coercePreviewText(payload: unknown): string | null {
  const p = payload as AnyObject | null;

  const candidates = ["previewText", "preview_text", "text", "rawText", "raw_text", "content"];

  for (const key of candidates) {
    const v = p?.[key];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }

  return null;
}

function safeJsonPreview(payload: unknown): string {
  try {
    const stripped = stripInternalKeys(payload);
    return JSON.stringify(stripped, null, 2);
  } catch {
    return "Preview unavailable";
  }
}

type ResumeSectionLike = {
  type?: string | null;
  title?: string | null;
  content?: unknown;
  text?: unknown;
  lines?: unknown;
  bullets?: unknown;
};

function stringsOnly(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractSectionText(section: ResumeSectionLike): string {
  const candidates: unknown[] = [section.content, section.text];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length) return c.trim();
  }

  const lines = stringsOnly(section.lines);
  if (lines.length) return lines.join("\n");

  const bullets = stringsOnly(section.bullets);
  if (bullets.length) return bullets.map((b) => `• ${b}`).join("\n");

  return "";
}

function extractBestResumeText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  try {
    const direct = typeof coercePreviewText === "function" ? coercePreviewText(payload) : null;
    if (typeof direct === "string" && direct.trim().length) return direct.trim();
  } catch {
    // ignore
  }

  const sectionsRaw = obj["sections"];
  if (!Array.isArray(sectionsRaw)) return null;

  const sections = sectionsRaw as ResumeSectionLike[];

  const rawSection =
    sections.find((s) => (s.type ?? "").toString().toUpperCase() === "RAW") ??
    sections.find((s) => (s.title ?? "").toString().toUpperCase() === "RAW");

  const picked = rawSection ?? sections[0];
  if (!picked) return null;

  const text = extractSectionText(picked);
  return text.length ? text : null;
}

export default function ResultsPage() {
  const [baselineId, setBaselineId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [latest, setLatest] = useState<LatestAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [complianceError, setComplianceError] = useState<ParsedComplianceError | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"manual" | "latest">("manual");
  const [lastLoadedRunIdentifier, setLastLoadedRunIdentifier] = useState<string | null>(null);
  const [autoGenerateThreshold] = useAutoGenerateThreshold();
  const [calibrationProfile, setCalibrationProfile] = useState<CalibrationProfile>("balanced");
  const [calibrationResult, setCalibrationResult] = useState<CalibratedResult | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [useCalibratedScore, setUseCalibratedScore] = useState(false);
  // Prevent SSR hydration mismatches for locale and timezone dependent formatting.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const runIdentifier = useMemo(() => {
    const candidate =
      searchParams?.get("assessmentId") ??
      searchParams?.get("analysisId") ??
      searchParams?.get("fitScoreId");
    return candidate?.trim() ?? null;
  }, [searchParams]);

  const setManualBaselineId = (value: string) => {
    setBaselineId(value);
    setAnalysisSource("manual");
  };

  const setManualJobId = (value: string) => {
    setJobId(value);
    setAnalysisSource("manual");
  };

  const getDocumentPayload = () => {
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? "";
    return { jobId: jobIdValue, baselineVersionId: baselineVersionIdValue };
  };

  const latestScore: number | null = useMemo(() => {
    if (!latest) return null;
    const v = latest.overallScore ?? (typeof latest.score === "number" ? latest.score : latest.score ?? null);
    return typeof v === "number" ? v : null;
  }, [latest]);

  const activeAnalysis = useMemo(() => {
    if (useCalibratedScore && calibrationResult) return calibrationResult;
    return latest;
  }, [useCalibratedScore, calibrationResult, latest]);

  const activeScore = useMemo(() => {
    if (!activeAnalysis) return null;
    const value =
      activeAnalysis.overallScore ??
      (typeof activeAnalysis.score === "number" ? activeAnalysis.score : activeAnalysis.score ?? null);
    return typeof value === "number" ? value : null;
  }, [activeAnalysis]);

  const activeVerdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(activeAnalysis?.verdict ?? null),
    [activeAnalysis?.verdict],
  );

  const currentVerdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(latest?.verdict ?? null),
    [latest?.verdict],
  );

  const verdictToneClass = useMemo(() => {
    switch (activeVerdictInfo.label) {
      case "Apply":
        return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
      case "Consider":
        return "border-amber-300/40 bg-amber-500/10 text-amber-200";
      case "Skip":
        return "border-rose-400/40 bg-rose-500/10 text-rose-200";
      default:
        return "border-slate-500/30 bg-slate-800/40 text-slate-200";
    }
  }, [activeVerdictInfo.label]);

  const jobDescriptor = useMemo(() => {
    if (latest?.jobTitle) {
      return latest.company ? `${latest.jobTitle} at ${latest.company}` : latest.jobTitle;
    }
    return latest?.jobId ? "Job details loaded" : "No job selected";
  }, [latest?.company, latest?.jobId, latest?.jobTitle]);

  const baselineDescriptor = useMemo(() => {
    if (latest?.baselineId) return "Baseline selected";
    if (baselineId) return "Baseline context provided";
    return "No baseline selected";
  }, [baselineId, latest?.baselineId]);

  const fitReviewPath = useMemo(() => {
    const candidateJobId = (latest?.jobId || jobId || "").trim();
    if (!candidateJobId) return "/fit-review";
    return `/fit-review?jobId=${encodeURIComponent(candidateJobId)}`;
  }, [jobId, latest?.jobId]);

  const readyForDocument = useMemo(() => {
    return analysisSource === "latest" && !!latest?.jobId && !!latest?.baselineVersionId;
  }, [analysisSource, latest?.baselineVersionId, latest?.jobId]);

  const latestBaselineVersionId = latest?.baselineVersionId?.trim() ?? "";
  const studioHref = useMemo(() => {
    const candidateJobId = latest?.jobId?.trim();
    if (!candidateJobId) return "/studio";
    const params = new URLSearchParams();
    params.set("jobId", candidateJobId);
    if (latestBaselineVersionId) {
      params.set("baselineVersionId", latestBaselineVersionId);
    }
    return `/studio?${params.toString()}`;
  }, [latest?.jobId, latestBaselineVersionId]);

  const oneTapEligible = useMemo(() => {
    if (activeScore === null) return false;
    return activeScore >= autoGenerateThreshold;
  }, [activeScore, autoGenerateThreshold]);

  const qualityBadge = useMemo(() => {
    if (activeScore === null) return null;
    const optimized = activeScore >= autoGenerateThreshold;
    return {
      label: optimized ? "Ready" : "Draft",
      toneClass: optimized
        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
        : "border-amber-300/40 bg-amber-500/10 text-amber-200",
    };
  }, [activeScore, autoGenerateThreshold]);

  const nextSteps = useMemo(
    () =>
      getNextSteps({
        score: activeScore,
        verdict: activeAnalysis?.verdict ?? null,
        hasAnalysis: !!latest,
        autoGenerateThreshold,
      }),
    [activeAnalysis?.verdict, activeScore, autoGenerateThreshold, latest],
  );

  const selectedCalibrationProfile = useMemo(
    () => CALIBRATION_PROFILE_OPTIONS.find((option) => option.value === calibrationProfile),
    [calibrationProfile],
  );

  const calibrationDeltaText = useMemo(() => {
    const delta = calibrationResult?.calibration?.delta;
    if (typeof delta !== "number") return null;
    if (delta > 0) return `+${delta.toFixed(1)}`;
    if (delta < 0) return delta.toFixed(1);
    return "0.0";
  }, [calibrationResult?.calibration?.delta]);

  const calibrationConfidenceSummary = useMemo(() => {
    if (!calibrationResult) {
      return "Run a calibration when you want to pressure-test how confident you feel about this score.";
    }
    const delta = calibrationResult.calibration?.delta;
    if (typeof delta !== "number") {
      return "Calibration complete. Compare the adjusted score above.";
    }
    if (delta > 0) {
      return `Confidence increased by ${delta.toFixed(1)} points.`;
    }
    if (delta < 0) {
      return `Confidence decreased by ${Math.abs(delta).toFixed(1)} points.`;
    }
    return "Confidence steady.";
  }, [calibrationResult]);

  const calibrationConfidenceRecommendation = useMemo(() => {
    if (!calibrationResult) {
      return "Keep the stored score unchanged; revisit calibration when you want to try a different weighting.";
    }
    const delta = calibrationResult.calibration?.delta;
    if (typeof delta !== "number") {
      return "Compare the calibrated score before you export.";
    }
    if (delta > 0) {
      return "Confidence is higher—move toward document generation while highlighting the strengths above.";
    }
    if (delta < 0) {
      return "Confidence dipped—address the gaps highlighted above before exporting.";
    }
    return "Confidence is unchanged—proceed with the next action.";
  }, [calibrationResult]);

  const dimensionEntries = useMemo(() => {
    const scores = normalizeDimensionScores(activeAnalysis ?? null);
    const keys = Object.keys(DIMENSION_LABELS) as Array<keyof FitDimensionScores>;
    return keys.map((key) => ({
      key,
      label: DIMENSION_LABELS[key],
      value: typeof scores[key] === "number" ? scores[key] : null,
    }));
  }, [activeAnalysis]);

  const reasonSummary = useMemo(
    () => buildReasonSummary(latest?.strengths ?? [], latest?.gaps ?? []),
    [latest?.gaps, latest?.strengths],
  );
  const highlightedStrengths = useMemo(() => {
    const all = [...reasonSummary.primary, ...reasonSummary.extras];
    return all.filter((item) => item.type === "strength").slice(0, 3);
  }, [reasonSummary]);
  const highlightedGaps = useMemo(() => {
    const all = [...reasonSummary.primary, ...reasonSummary.extras];
    return all.filter((item) => item.type === "gap").slice(0, 3);
  }, [reasonSummary]);

  const complianceFlagList = useMemo(
    () => sortComplianceFlagsBySeverity(mapComplianceFlags(latest?.complianceFlags ?? undefined)),
    [latest?.complianceFlags],
  );

  const topComplianceFlags = complianceFlagList.slice(0, 3);
  const hasMoreComplianceFlags = complianceFlagList.length > 3;

  const debugMode = debugUiEnabled;

  const latestStatusMessage = useMemo(() => {
    if (loadingLatest) return "Loading latest analysis...";
    if (!jobId) return "Enter a job ID to load the latest analysis.";
    if (!baselineId) return "Select a baseline to load the latest analysis.";
    if (analysisSource === "latest" && latest) return "Latest analysis loaded.";
    return "Load latest analysis to populate the score and unlock one tap export.";
  }, [analysisSource, jobId, baselineId, latest, loadingLatest]);

  const loadAssessmentById = useCallback(
    async (assessmentId: string) => {
      if (loadingLatest) return;
      if (!assessmentId) {
        setError("Assessment ID is required to load analysis.");
        return;
      }

      setLoadingLatest(true);
      setError(null);
      setLatest(null);
      setComplianceError(null);

      try {
        const res = await fetch(
          `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`,
          { cache: "no-store" },
        );

        const payload = await readResponsePayload(res.clone());

        if (!res.ok) {
          const compliance = parseComplianceError({ status: res.status, payload });
          if (compliance) {
            setComplianceError(compliance);
            return;
          }

          const message = formatErrorMessage(payload, "Unable to load the requested analysis.");
          throw new Error(message);
        }

        const data: LatestAnalysis = await res.json();
        setLatest(data);
        setBaselineId(data.baselineId ?? "");
        setJobId(data.jobId ?? "");
        setAnalysisSource("latest");
      } catch (error: unknown) {
        setError(resolveUnknownMessage(error) ?? "Failed to load analysis");
      } finally {
        setLoadingLatest(false);
      }
    },
    [loadingLatest],
  );

  async function loadLatest() {
    if (loadingLatest) return;
    if (!jobId) {
      setError("Job ID is required to load analysis.");
      return;
    }
    if (!baselineId) {
      setError("Baseline ID is required to load analysis.");
      return;
    }

    const hasManualSelection = baselineId.trim().length > 0 || jobId.trim().length > 0;
    const shouldConfirm = analysisSource === "manual" && hasManualSelection;

    if (shouldConfirm) {
      const proceed =
        typeof window !== "undefined"
          ? window.confirm(
              "Loading the latest analysis will replace the baseline and job IDs you currently have selected. Continue?",
            )
          : true;
      if (!proceed) return;
    }

    setLoadingLatest(true);
    setError(null);
    setLatest(null);
    setComplianceError(null);

    try {
      const res = await fetch(
        `/api/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(baselineId)}/latest`,
        { cache: "no-store" },
      );

      const payload = await readResponsePayload(res.clone());

      if (!res.ok) {
        const compliance = parseComplianceError({ status: res.status, payload });
        if (compliance) {
          setComplianceError(compliance);
          return;
        }

        const message = formatErrorMessage(payload, "Unable to load latest analysis.");
        throw new Error(message);
      }

      const data: LatestAnalysis = await res.json();
      if (!data.assessmentId) {
        throw new Error("Latest assessment is missing an assessment ID.");
      }

      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete("jobId");
      params.delete("baselineId");
      params.set("assessmentId", data.assessmentId);
      const query = params.toString();
      const path = query ? `/results?${query}` : "/results";
      await router.replace(path);
    } catch (error: unknown) {
      setError(resolveUnknownMessage(error) ?? "Failed to load analysis");
    } finally {
      setLoadingLatest(false);
    }
  }

  useEffect(() => {
    if (!runIdentifier) {
      setLastLoadedRunIdentifier(null);
      return;
    }

    if (runIdentifier === lastLoadedRunIdentifier) return;

    setLastLoadedRunIdentifier(runIdentifier);
    void loadAssessmentById(runIdentifier);
  }, [loadAssessmentById, runIdentifier, lastLoadedRunIdentifier]);

  useEffect(() => {
    setCalibrationResult(null);
    setUseCalibratedScore(false);
    setCalibrationError(null);
  }, [latest?.assessmentId]);

  const handleCalibrate = useCallback(async () => {
    if (!latest?.assessmentId) return;

    const profileOption = selectedCalibrationProfile;
    if (!profileOption?.weights) {
      setCalibrationError("Calibration failed. The selected profile is missing weights.");
      setCalibrationResult(null);
      return;
    }

    setCalibrating(true);
    setCalibrationError(null);

    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: latest.assessmentId,
          profileName: calibrationProfile,
          weights: profileOption.weights,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        await res.text();
        setCalibrationError(
          "Calibration failed. The server returned an unexpected response. This is usually a routing or auth issue.",
        );
        setCalibrationResult(null);
        return;
      }

      const payload = await readResponsePayload(res.clone());

      if (!res.ok) {
        const message = formatErrorMessage(payload, "Unable to calibrate the latest analysis.");
        setCalibrationError(message);
        setCalibrationResult(null);
        return;
      }

      const data = await res.json();
      setCalibrationResult(data as CalibratedResult);
    } catch (error: unknown) {
      setCalibrationError(resolveUnknownMessage(error) ?? "Calibration failed.");
      setCalibrationResult(null);
    } finally {
      setCalibrating(false);
    }
  }, [calibrationProfile, latest?.assessmentId, selectedCalibrationProfile]);

  useEffect(() => {
    const job = searchParams?.get("jobId");
    if (job) setManualJobId(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Results"
          description="Review your score and the reasons behind it, then choose your next move."
        />

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          {!latest ? (
            <EmptyState
              title="No analysis yet"
              body="Load the latest analysis to reveal the fit score and verdict."
              cta={
                <FormButton
                  variant="ghost"
                  onClick={() => void loadLatest()}
                  disabled={!jobId || loading || loadingLatest}
                >
                  {loadingLatest ? "Loading latest..." : "Load analysis"}
                </FormButton>
              }
              className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          ) : (
            <>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        Active fit score
                      </p>
                      <p className="text-5xl font-semibold text-white">
                        {activeScore !== null ? activeScore.toFixed(1) : "Not available"}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <span
                        className={`rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] ${verdictToneClass}`}
                      >
                        {activeVerdictInfo.label}
                      </span>
                      <p className="max-w-2xl text-sm text-slate-200">{activeVerdictInfo.description}</p>
                      <p className="text-xs text-slate-400">{jobDescriptor}</p>
                      <p className="text-xs text-slate-400">{baselineDescriptor}</p>
                      <p className="text-xs text-slate-400">
                        The active score is the live lens we share on this page; the saved current score remains stable until a refresh.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 flex flex-col items-end">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-3 max-w-[220px] text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Current score
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-white">
                      {latestScore !== null ? latestScore.toFixed(1) : "Not available"}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                      {currentVerdictInfo.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Saved until you choose to rerun the analysis.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-3 max-w-[260px] text-center">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                        Confidence check (optional)
                      </p>
                      <span className="text-xs text-slate-400">Optional</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      Re-running the score with a different profile shows how sensitive the verdict is; your saved score stays unaffected.
                    </p>
                    {calibrationResult ? (
                      <>
                        <p className="mt-3 text-3xl font-semibold text-white">
                          {calibrationResult.overallScore?.toFixed(1) ?? "Not available"}
                        </p>
                        <p className="text-sm text-slate-300">
                          {calibrationConfidenceSummary}
                          {calibrationDeltaText ? ` (${calibrationDeltaText} vs current score)` : ""}
                        </p>
                        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                          Recommendation
                        </p>
                        <p className="text-sm text-slate-300">{calibrationConfidenceRecommendation}</p>
                        <label className="mt-4 flex items-center gap-2 text-sm text-slate-200 justify-center">
                          <input
                            id="use-calibrated-score"
                            type="checkbox"
                            checked={useCalibratedScore}
                            onChange={(event) => setUseCalibratedScore(event.target.checked)}
                            className="h-4 w-4 cursor-pointer rounded border border-white/20 bg-slate-950 text-emerald-300 focus:ring-emerald-400"
                          />
                          <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                            Apply this confidence lens for downstream actions
                          </span>
                        </label>
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-slate-400">
                        Run a confidence check to preview how a different lens shifts the verdict.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Score explanation
                  </p>
                  <h2 className="text-lg font-semibold text-slate-100">Why this verdict?</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {latest?.summary
                      ? latest.summary
                      : "Load the latest analysis to surface the strengths, gaps, and dimension contributions behind this score."}
                  </p>
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  Dimension scores show how each area contributed to the verdict. Treat the lower scores as the best places to provide new or clarified evidence.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {dimensionEntries.map((dimension) => (
                    <div
                      key={dimension.key}
                      className="rounded-2xl border border-white/10 bg-slate-900/30 p-3"
                    >
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        {dimension.label}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {dimension.value !== null ? dimension.value.toFixed(1) : "Not available"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Strengths</p>
                    <div className="mt-3 space-y-3">
                      {highlightedStrengths.length ? (
                        highlightedStrengths.map((item, index) => (
                          <div key={`${item.message}-${index}`} className="space-y-1">
                            <p className="text-sm font-semibold text-white">{item.message}</p>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Confidence</p>
                            <p className="text-sm text-slate-300">Lean on this strength as you tailor your story.</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">Generate or load an analysis to see the confirming signals.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">Gaps</p>
                    <div className="mt-3 space-y-3">
                      {highlightedGaps.length ? (
                        highlightedGaps.map((item, index) => (
                          <div key={`${item.message}-${index}`} className="space-y-1">
                            <p className="text-sm font-semibold text-white">{item.message}</p>
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Action</p>
                            <p className="text-sm text-slate-300">
                              Clarify how your experience addresses this area or build new evidence before exporting.
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400">
                          No gaps surfaced yet; run the latest analysis to highlight where to focus.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

                <div className="mt-5 space-y-3">
                  <div>
                    <label
                      className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400"
                      htmlFor="calibration-profile"
                    >
                      Confidence check profile
                    </label>
                    <div className="mt-2 flex flex-col gap-1">
                      <select
                        id="calibration-profile"
                        value={calibrationProfile}
                        onChange={(event) => setCalibrationProfile(event.target.value as CalibrationProfile)}
                        className="rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 outline-none transition hover:border-white/30 focus:border-emerald-400"
                      >
                        {CALIBRATION_PROFILE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400">
                        {selectedCalibrationProfile?.description ?? "Adjust weights to tilt the scoring emphasis."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <FormButton onClick={() => void handleCalibrate()} disabled={calibrating}>
                      {calibrating ? "Calibrating..." : "Run confidence check"}
                    </FormButton>
                    <p className="text-xs text-slate-400">
                      Confidence check reruns the analysis under the selected profile without overwriting the stored score.
                    </p>
                  </div>
                </div>

              {calibrationError ? (
                <Alert intent="error" title="Calibration failed">
                  {calibrationError}
                </Alert>
              ) : null}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                System constraints
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Resume truth & boundary checks</h2>
              <p className="mt-1 text-sm text-slate-300">
                These signals reflect system-enforced boundaries that determine what we can safely describe or generate. They are not personal judgments, only guidance about output limits.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Sorted by impact</span>
          </div>

          {topComplianceFlags.length ? (
            <ul className="mt-4 space-y-3 text-sm text-slate-200">
              {topComplianceFlags.map((flag) => (
                <li key={flag.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-400">
                    <span>{flag.severity === "block" ? "Required boundary" : "Advisory boundary"}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-100">{flag.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No constraints triggered on this run.</p>
          )}

          {hasMoreComplianceFlags ? (
            <details className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                Show all {complianceFlagList.length} flags
              </summary>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {complianceFlagList.map((flag) => (
                  <li
                    key={`all-${flag.id}`}
                    className="rounded-xl border border-white/10 bg-slate-950/50 p-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      {flag.severity === "block" ? "Required boundary" : "Advisory boundary"}
                    </p>
                    <p className="text-sm text-slate-100">{flag.message}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Recommended next move
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Follow this path</h2>
              <p className="mt-1 text-sm text-slate-300">
                This sequence mirrors the real-life cadence: understand the verdict, decide if and how to apply, polish your materials, apply, then prep for interviews.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Ordered flow</span>
          </div>

          <ol className="list-decimal space-y-4 pl-4 text-sm text-slate-300 marker:text-slate-500">
            {nextSteps.map((step, index) => (
              <li key={step.title + "-" + index} className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">{step.title}</p>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>

          <p className="text-sm text-slate-300">
            Tools in this flow include the document generation controls below and the Interview Toolkit mentioned in step 5.
          </p>
        </section>

        {complianceError ? <ComplianceViolationPanel error={complianceError} /> : null}

        {error ? (
          <Alert intent="error" title="Uh oh">
            {error}
          </Alert>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Resume and Cover Letter Studio
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Open the Studio</h2>
              <p className="mt-1 text-sm text-slate-300">
                Generate curated drafts and exportable documents that reflect the verdict above.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-400">
                Studio pulls in the latest job, baseline, and analysis data so you can keep the momentum going.
              </p>
              <FormButton
                onClick={() => {
                  void router.push(studioHref);
                }}
                disabled={!latest?.jobId || !latestBaselineVersionId}
              >
                Open Resume and Cover Letter Studio
              </FormButton>
            </div>
          </div>
        </section>

        {debugMode ? (
          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Selection</p>
                <h2 className="text-lg font-semibold text-slate-100">Latest IDs</h2>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Baseline
                  </label>
                  <TextInput
                    value={baselineId}
                    onChange={(event) => setManualBaselineId(event.target.value)}
                    placeholder="Baseline ID"
                    readOnly={analysisSource === "latest"}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                    Job
                  </label>
                  <TextInput
                    value={jobId}
                    onChange={(event) => setManualJobId(event.target.value)}
                    placeholder="Job ID"
                  />
                </div>
              </div>

              {!baselineId ? (
                <Alert intent="warning">
                  Enter a baseline ID or visit the{" "}
                  <Link href="/baseline" className="text-sky-300 underline">
                    baseline library
                  </Link>{" "}
                  to add one before generating resumes.
                </Alert>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <FormButton variant="secondary" onClick={() => void loadLatest()} disabled={!jobId || loading || loadingLatest}>
                  {loadingLatest ? "Loading latest..." : "Load latest analysis"}
                </FormButton>
                <span className="text-xs text-slate-400">{latestStatusMessage}</span>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Latest analysis
                  </p>
                  <h2 className="text-lg font-semibold text-slate-100">Raw JSON</h2>
                </div>
              </div>

              {latest ? (
                <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-200">
                  {JSON.stringify(latest, null, 2)}
                </pre>
              ) : (
                <EmptyState
                  title="No analysis yet"
                  body="Load the latest analysis to inspect the JSON payload."
                  cta={
                    <FormButton variant="ghost" onClick={() => void loadLatest()} disabled={!jobId || loading || loadingLatest}>
                      {loadingLatest ? "Loading latest..." : "Load analysis"}
                    </FormButton>
                  }
                  className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
                />
              )}
            </section>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
