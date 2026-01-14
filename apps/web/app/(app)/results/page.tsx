"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import {
  ComplianceFlagPanel,
  ComplianceViolationPanel,
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
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
import {
  RealityCheckDto,
  RealityCheckOutcome,
  getRealityCheck,
} from "@/lib/realityCheck";
import { markJourneyStepCompleted } from "@/src/lib/journeyNavStore";

type LatestAnalysis = {
  baselineId: string;
  baselineVersionId?: string | null;
  jobId: string;
  overallScore?: number;
  note?: string;
  verdict?: string | null;
  jobTitle?: string | null;
  company?: string | null;

  // Optional, because API payloads often include these even if the UI does not always use them.
  assessmentId?: string | null;
  score?: number | null;
};

type VerdictDefinition = {
  label: string;
  description: string;
};

type NextStep = {
  title: string;
  description: string;
};

type NextStepArgs = {
  score: number | null | undefined;
  verdict?: string | null;
  hasAnalysis: boolean;
  hasResume: boolean;
};

const debugUiEnabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";

const VERDICT_DEFINITIONS: Record<string, VerdictDefinition> = {
  STRONG_APPLY: {
    label: "Strong apply",
    description: "This role closely matches your baseline. Prioritize it in your pipeline.",
  },
  APPLY: {
    label: "Apply",
    description: "You meet the core requirements. Focus on the highlighted strengths.",
  },
  CONSIDER: {
    label: "Consider",
    description: "There are some gaps. Address the highlighted areas before you proceed.",
  },
  SKIP: {
    label: "Target acquired",
    description:
      "Significant gaps detected. Open Fit Review to see the highest impact adjustments.",
  },
};

const DEFAULT_VERDICT: VerdictDefinition = {
  label: "Verdict pending",
  description: "Load an analysis to see how this role compares to your baseline.",
};

const normalizeVerdictKey = (value?: string | null) =>
  value?.trim().replace(/[^A-Za-z0-9]/g, "_").toUpperCase() ?? "";

const formatVerdict = (verdict?: string | null): VerdictDefinition => {
  const key = normalizeVerdictKey(verdict);
  return VERDICT_DEFINITIONS[key] ?? DEFAULT_VERDICT;
};

const getNextSteps = ({
  score,
  verdict,
  hasAnalysis,
  hasResume,
}: NextStepArgs): NextStep[] => {
  const verdictInfo = formatVerdict(verdict);
  const needsMoreInsight = score === null || score === undefined || score < 92;
  const steps: NextStep[] = [];

  steps.push({
    title: "Open Fit Review",
    description: hasAnalysis
      ? `Explore why this role received a ${verdictInfo.label.toLowerCase()} verdict and what to focus on next.`
      : "Generate or load the latest analysis to surface Fit Review and tailored guidance.",
  });

  steps.push({
    title: "Practice with Interview Toolkit",
    description:
      "Pair Fit Review insights with the Interview Toolkit or a guided session to tackle the most impactful gaps.",
  });

  if (needsMoreInsight) {
    steps.push({
      title: "Re-run the analysis",
      description:
        "Address the gaps Fit Review outlines, rerun the analysis, and confirm your baseline still reflects the role.",
    });
  }

  steps.push({
    title: "Generate a resume",
    description: needsMoreInsight
      ? "Once your fit score hits 92+, export a resume tailored to this opportunity."
      : hasResume
        ? "Download or share the resume you already generated."
        : "One tap generation is available; export and share with confidence.",
  });

  return steps;
};

export default function ResultsPage() {
  const [baselineId, setBaselineId] = useState<string>("");
  const [jobId, setJobId] = useState<string>("");
  const [latest, setLatest] = useState<LatestAnalysis | null>(null);
  const [resumeResponse, setResumeResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [complianceError, setComplianceError] = useState<ParsedComplianceError | null>(null);
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"manual" | "latest">("manual");
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeTierGateError, setResumeTierGateError] = useState<TierGateError | null>(null);
  const [resumeComplianceError, setResumeComplianceError] = useState<ParsedComplianceError | null>(
    null,
  );

  const resumeWarningFlags = (resumeResponse?.compliance_flags ?? []).filter(
    (flag: { severity?: string | null }) => (flag?.severity ?? "warn").toLowerCase() !== "block",
  );
  const resumeAuditId = resumeResponse?.audit_id;
  const resumeBaselineHash =
    resumeResponse?.baseline_version_hash ?? resumeResponse?.baselineVersionHash ?? null;

  const router = useRouter();
  const searchParams = useSearchParams();
  const [skipNote, setSkipNote] = useState<string | null>(null);
  const [realityCheck, setRealityCheck] = useState<RealityCheckDto | null>(null);
  const [realityCheckError, setRealityCheckError] = useState<string | null>(null);
  const [realityCheckLoading, setRealityCheckLoading] = useState(false);

  const setManualBaselineId = (value: string) => {
    setBaselineId(value);
    setAnalysisSource("manual");
    setResumeError(null);
    setResumeTierGateError(null);
    setResumeComplianceError(null);
  };

  const setManualJobId = (value: string) => {
    setJobId(value);
    setAnalysisSource("manual");
    setResumeError(null);
    setResumeTierGateError(null);
    setResumeComplianceError(null);
  };

  const getResumePayload = () => {
    const jobIdValue = latest?.jobId?.trim() ?? "";
    const baselineVersionIdValue = latest?.baselineVersionId?.trim() ?? "";
    return { jobId: jobIdValue, baselineVersionId: baselineVersionIdValue };
  };

  const latestEndpoint = useMemo(() => {
    if (!jobId) return null;
    return `/api/analysis/job/${encodeURIComponent(jobId)}/latest`;
  }, [jobId]);

  const latestScore: number | null = useMemo(() => {
    if (!latest) return null;
    const v =
      latest.overallScore ??
      (typeof latest.score === "number" ? latest.score : latest.score ?? null);
    return typeof v === "number" ? v : null;
  }, [latest]);

  const verdictInfo = useMemo(() => formatVerdict(latest?.verdict ?? null), [latest?.verdict]);

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

  const readyForResume = useMemo(() => {
    return analysisSource === "latest" && !!latest?.jobId && !!latest?.baselineVersionId;
  }, [analysisSource, latest?.baselineVersionId, latest?.jobId]);

  const oneTapEligible = useMemo(() => {
    if (latestScore === null) return false;
    return latestScore >= 92;
  }, [latestScore]);

  const qualityBadge = useMemo(() => {
    if (latestScore === null) return null;
    const optimized = latestScore >= 92;
    return {
      label: optimized ? "Optimized" : "Draft",
      toneClass: optimized
        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
        : "border-amber-300/40 bg-amber-500/10 text-amber-200",
    };
  }, [latestScore]);

  const nextSteps = useMemo(() => {
    return getNextSteps({
      score: latestScore,
      verdict: latest?.verdict ?? null,
      hasAnalysis: !!latest,
      hasResume: !!resumeResponse,
    });
  }, [latest, latestScore, resumeResponse]);

  const debugMode = debugUiEnabled;

  const latestStatusMessage = useMemo(() => {
    if (loadingLatest) return "Loading latest analysis...";
    if (!jobId) return "Enter a job ID to load the latest analysis.";
    if (analysisSource === "latest" && latest) return "Latest analysis loaded.";
    return "Load latest analysis to populate the score and unlock one tap export.";
  }, [analysisSource, jobId, latest, loadingLatest]);

  const analysisIndicatesGap = useMemo(() => {
    if (latestScore === null) return false;
    return latestScore < 92;
  }, [latestScore]);

  const showRealityCheckCard = true;

  const runRealityCheckPath = useMemo(() => {
    if (!jobId || !baselineId) return "/reality-check";
    return `/reality-check/run?jobId=${encodeURIComponent(jobId)}&baselineId=${encodeURIComponent(
      baselineId,
    )}`;
  }, [baselineId, jobId]);

  const baselineUpdatePath = useMemo(() => {
    if (!jobId || !baselineId) return "/reality-check";
    return `/reality-check?jobId=${encodeURIComponent(jobId)}&baselineId=${encodeURIComponent(
      baselineId,
    )}`;
  }, [baselineId, jobId]);

  async function loadLatest() {
    if (loadingLatest) return;
    if (!jobId) {
      setError("Job ID is required to load analysis.");
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
    setTierGateError(null);
    setResumeError(null);
    setResumeTierGateError(null);
    setResumeComplianceError(null);

    try {
      if (!latestEndpoint) throw new Error("Job ID is required.");

      const res = await fetch(`/api/analysis/job/${encodeURIComponent(jobId)}/latest`, {
        cache: "no-store",
      });

      const payload = await readResponsePayload(res.clone());

      if (!res.ok) {
        const tierGate = parseTierGateError({ status: res.status, payload });
        if (tierGate) {
          setTierGateError(tierGate);
          return;
        }

        const compliance = parseComplianceError({ status: res.status, payload });
        if (compliance) {
          setComplianceError(compliance);
          return;
        }

        const message = formatErrorMessage(payload, "Unable to load latest analysis.");
        throw new Error(message);
      }

      const data: LatestAnalysis = await res.json();
      setLatest(data);
      setBaselineId(data.baselineId ?? "");
      setJobId(data.jobId ?? "");
      setAnalysisSource("latest");
    } catch (e: any) {
      setError(e?.message || "Failed to load analysis");
    } finally {
      setLoadingLatest(false);
    }
  }

  async function generateResume(oneTap = false) {
    const { jobId: resumeJobId, baselineVersionId: resumeBaselineVersionId } = getResumePayload();
    if (analysisSource !== "latest" || !resumeJobId || !resumeBaselineVersionId) {
      setResumeError("Load the latest analysis before exporting a resume.");
      return;
    }

    setLoading(true);
    setResumeError(null);
    setResumeTierGateError(null);
    setResumeComplianceError(null);
    setResumeResponse(null);

    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baselineId,
          baselineVersionId: resumeBaselineVersionId,
          jobId: resumeJobId,
          oneTap,
        }),
      });

      if (!res.ok) {
        const payload = await readResponsePayload(res);
        const tierGate = parseTierGateError({ status: res.status, payload });

        if (tierGate) {
          setResumeTierGateError(tierGate);
          return;
        }

        const compliance = parseComplianceError({ status: res.status, payload });

        if (compliance) {
          setResumeComplianceError(compliance);
          return;
        }

        const message = formatErrorMessage(payload, "Resume generation failed");
        throw new Error(message);
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const json = await res.json();
        setResumeResponse(json);
      } else {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resume";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      setResumeError(e?.message || "Resume generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function exportResume(format: "docx" | "pdf") {
    const { jobId: resumeJobId, baselineVersionId: resumeBaselineVersionId } = getResumePayload();
    if (analysisSource !== "latest" || !resumeJobId || !resumeBaselineVersionId) {
      setResumeError("Load the latest analysis before generating a resume.");
      return;
    }

    setExporting(format);
    setResumeError(null);
    setResumeTierGateError(null);
    setResumeComplianceError(null);

    try {
      const res = await fetch(`/api/resume/export?format=${encodeURIComponent(format)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baselineId,
          baselineVersionId: resumeBaselineVersionId,
          jobId: resumeJobId,
          oneTap: true,
        }),
      });

      if (!res.ok) {
        const payload = await readResponsePayload(res);
        const tierGate = parseTierGateError({ status: res.status, payload });

        if (tierGate) {
          setResumeTierGateError(tierGate);
          return;
        }

        const compliance = parseComplianceError({ status: res.status, payload });

        if (compliance) {
          setResumeComplianceError(compliance);
          return;
        }

        const message = formatErrorMessage(payload, "Resume export failed");
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setResumeError(e?.message || "Resume export failed");
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const job = params.get("jobId");
    if (job) {
      setManualJobId(job);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedNote = window.sessionStorage.getItem("ttr:realityCheckSkipNote");
    if (storedNote) {
      setSkipNote(storedNote);
      window.sessionStorage.removeItem("ttr:realityCheckSkipNote");
      return;
    }

    if (searchParams.get("realityCheckSkipped")) {
      setSkipNote("You skipped the Reality Check update flow. Consider reviewing suggested updates later.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!jobId || !baselineId) {
      setRealityCheck(null);
      setRealityCheckError(null);
      setRealityCheckLoading(false);
      return;
    }

    let cancelled = false;

    const loadRealityCheck = async () => {
      setRealityCheckLoading(true);
      setRealityCheckError(null);
      try {
        const existing = await getRealityCheck(jobId, baselineId);
        if (!cancelled) {
          setRealityCheck(existing);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load Reality Check";
          setRealityCheckError(message);
        }
      } finally {
        if (!cancelled) {
          setRealityCheckLoading(false);
        }
      }
    };

    void loadRealityCheck();

    return () => {
      cancelled = true;
    };
  }, [jobId, baselineId]);

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Results"
          description="Generate resumes, review the latest analysis, and export artifacts for any job."
        />

        {skipNote ? (
          <Alert intent="info">
            <p>{skipNote}</p>
          </Alert>
        ) : null}

        {showRealityCheckCard ? (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Reality Check
                </p>
                <h2 className="text-lg font-semibold text-slate-100">Baseline health</h2>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                {realityCheckLoading
                  ? "Checking..."
                  : realityCheck
                    ? realityCheck.outcome.replace("_", " ")
                    : "Not run"}
              </span>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              {!baselineId ? (
                <p>
                  Upload or select a baseline so Reality Check can confirm the document still mirrors
                  this role before you generate outputs.
                </p>
              ) : realityCheck ? (
                realityCheck.outcome === RealityCheckOutcome.UPDATE_RECOMMENDED ? (
                  <p>
                    Reality Check detected drift in baseline content. Review the suggested updates
                    before generating artifacts.
                  </p>
                ) : (
                  <p>
                    Reality Check confirmed the baseline accurately reflects this job. Lean on Fit
                    Review insights when building your next moves.
                  </p>
                )
              ) : analysisIndicatesGap ? (
                <p>
                  Fit Review surfaced new gaps, so Reality Check can help verify the baseline still
                  matches the job before you share outputs.
                </p>
              ) : (
                <p>
                  Reality Check has not been run for the current baseline/job pair. Run it now to
                  validate baseline accuracy against reality.
                </p>
              )}
            </div>

            {realityCheckError ? (
              <Alert intent="error" title="Reality Check">
                <p>{realityCheckError}</p>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {!baselineId ? (
                <FormButton onClick={() => router.push("/baseline")}>Go to Baselines</FormButton>
              ) : realityCheck ? (
                realityCheck.outcome === RealityCheckOutcome.UPDATE_RECOMMENDED ? (
                  <>
                    <FormButton onClick={() => router.push(baselineUpdatePath)}>
                      Review suggested baseline updates
                    </FormButton>
                    <FormButton variant="secondary" onClick={() => router.push(runRealityCheckPath)}>
                      Rerun Reality Check
                    </FormButton>
                  </>
                ) : (
                  <>
                    <FormButton onClick={() => router.push(fitReviewPath)}>View Fit Review</FormButton>
                    <FormButton variant="secondary" onClick={() => router.push("/applications")}>
                      Back to Job Tracker
                    </FormButton>
                  </>
                )
              ) : (
                <FormButton onClick={() => router.push(runRealityCheckPath)}>Run Reality Check</FormButton>
              )}
            </div>
          </section>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Next steps
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Where to focus now</h2>
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-slate-400">Action plan</span>
          </div>

          <ol className="list-decimal space-y-4 pl-4 text-sm text-slate-300 marker:text-slate-500">
            {nextSteps.map((step, index) => (
              <li key={step.title + "-" + index} className="space-y-1">
                <p className="text-sm font-semibold text-slate-100">{step.title}</p>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>

          <div className="flex justify-end">
            <FormButton
              variant="ghost"
              onClick={() => router.push(fitReviewPath)}
              disabled={!latest?.jobId}
            >
              Open Fit Review
            </FormButton>
          </div>
        </section>

        {tierGateError ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-50">
            <span>
              {tierGateError.message ?? "A plan update may unlock resume generation."}{" "}
            </span>
            <Link href="/pricing" className="font-semibold text-white underline">
              View plans
            </Link>
            .
          </div>
        ) : null}
        {complianceError ? <ComplianceViolationPanel error={complianceError} /> : null}
        {error ? (
          <Alert intent="error" title="Uh oh">
            {error}
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Latest analysis
                </p>
                <h2 className="text-lg font-semibold text-slate-100">Fit score</h2>
              </div>
              <div className="text-xs text-slate-400">
                <div>{jobDescriptor}</div>
                <div>{baselineDescriptor}</div>
              </div>
            </div>

            <div className="flex items-end gap-6">
              <p className="text-4xl font-semibold text-white">
                {latestScore !== null ? latestScore.toFixed(1) : "n/a"}
              </p>
              <div className="space-y-1 text-sm text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  {verdictInfo.label}
                </p>
                <p>{verdictInfo.description}</p>
              </div>
            </div>

            {latest?.note ? <p className="text-sm text-slate-400">{latest.note}</p> : null}

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
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <FormButton
                variant="ghost"
                onClick={() => router.push(fitReviewPath)}
                disabled={!latest?.jobId}
              >
                Open Fit Review
              </FormButton>
              <p className="text-xs text-slate-400">Review the latest match details in Fit Review.</p>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Generate resume
                </p>
                <h2 className="text-lg font-semibold text-slate-100">Output</h2>
              </div>
              {qualityBadge ? (
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] ${qualityBadge.toneClass}`}
                >
                  {qualityBadge.label}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <FormButton
                onClick={() => void generateResume(false)}
                disabled={!readyForResume || loading}
              >
                {loading
                  ? "Generating..."
                  : latestScore !== null && latestScore >= 92
                    ? "Generate resume"
                    : "Generate draft resume"}
              </FormButton>

              <FormButton
                variant="secondary"
                onClick={() => void generateResume(true)}
                disabled={!readyForResume || !oneTapEligible || loading}
                title={
                  readyForResume
                    ? oneTapEligible
                      ? "Generate immediately with compliance checks"
                      : "Requires fit score of at least 92"
                    : "Load the latest analysis before using one tap generate"
                }
              >
                {loading ? "Checking..." : "One tap generate (>=92 fit score)"}
              </FormButton>
            </div>

            <div className="flex flex-wrap gap-3">
                <FormButton
                  variant="secondary"
                  onClick={() => void exportResume("docx")}
                  disabled={!readyForResume || !oneTapEligible || !!exporting}
                >
                  {exporting === "docx" ? "Downloading..." : "Download DOCX"}
                </FormButton>

                <FormButton
                  variant="secondary"
                  onClick={() => void exportResume("pdf")}
                  disabled={!readyForResume || !oneTapEligible || !!exporting}
                >
                  {exporting === "pdf" ? "Downloading..." : "Download PDF"}
                </FormButton>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              {oneTapEligible ? (
                <p>
                  One tap generation is enabled when your fit score reaches 92 and the latest analysis
                  is ready. Manual generation remains available while you fine-tune your match.
                </p>
              ) : (
                <div className="space-y-3">
                  <p>
                    Your score is below 92. Follow these steps to reach the threshold:
                  </p>
                  <ol className="space-y-2 pl-4 text-slate-300">
                    <li>Open Fit Review to inspect the verdict and confirmed gaps.</li>
                    <li>
                      Address the gaps with Interview Toolkit, a practice session, or other prep work.
                    </li>
                    <li>Re-run the analysis to confirm the baseline still reflects the role.</li>
                  </ol>
                  <p>Manual generation stays available while you move through those steps.</p>
                  <FormButton
                    variant="ghost"
                    onClick={() => router.push(fitReviewPath)}
                    disabled={!latest?.jobId}
                  >
                    Open Fit Review
                  </FormButton>
                </div>
              )}
            </div>

            {resumeTierGateError ? (
              <p className="text-sm text-amber-300">
                {resumeTierGateError.message ?? "Resume generation is limited by your current plan."}{" "}
                <Link href="/pricing" className="font-semibold text-white underline">
                  View plans
                </Link>
                .
              </p>
            ) : null}
            {resumeComplianceError ? <ComplianceViolationPanel error={resumeComplianceError} /> : null}
            {resumeError ? (
              <Alert intent="error" title="Unable to generate resume">
                {resumeError}
              </Alert>
            ) : null}

            {resumeResponse ? (
              <>
                {resumeWarningFlags.length ? (
                  <ComplianceFlagPanel
                    title="Compliance warnings"
                    description="Resume generated with compliance notices."
                    flags={resumeWarningFlags}
                    auditId={resumeAuditId}
                    baselineVersionHash={resumeBaselineHash}
                    intent="warning"
                  />
                ) : null}
                <pre className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-200">
                  {JSON.stringify(resumeResponse, null, 2)}
                </pre>
              </>
            ) : (
              <EmptyState
                title="No resume generated yet"
                body="Generate a draft to view the payload."
                cta={
                  <FormButton onClick={() => void generateResume(false)} disabled={!readyForResume || loading}>
                    Generate draft resume
                  </FormButton>
                }
                className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
              />
            )}
          </section>
        </div>

        {debugMode ? (
          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Selection
                </p>
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
                  {analysisSource === "latest" ? (
                    <p className="text-[11px] text-slate-400">
                      Resume generation uses baseline version {latest?.baselineVersionId ?? "unknown"} from the latest analysis, so this field cannot be edited while it is selected.
                    </p>
                  ) : null}
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

              <div className="rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
                {analysisSource === "latest" ? (
                  <>
                    <strong className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      Latest analysis
                    </strong>
                    <p className="mt-1">
                      Loaded from job {latest?.jobId ?? "unknown"} and baseline {latest?.baselineId ?? "unknown"}. Resume generation uses baseline version {latest?.baselineVersionId ?? "unknown"} from the latest analysis. Modify the job above and load the latest analysis again to target a different baseline.
                    </p>
                  </>
                ) : (
                  <>
                    <strong className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      Manual selection
                    </strong>
                    <p className="mt-1">
                      Edit the baseline/job IDs to reuse a specific analysis. Loading the latest will overwrite the values you entered.
                    </p>
                  </>
                )}
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
                <FormButton
                  variant="secondary"
                  onClick={() => void loadLatest()}
                  disabled={!jobId || loading || loadingLatest}
                >
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
              )}
            </section>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
