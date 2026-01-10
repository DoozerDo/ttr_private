"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ComplianceViolationPanel } from "@/components/ComplianceViolationPanel";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TextInput } from "@/components/TextInput";
import { TierGateNotice } from "@/components/TierGateNotice";
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

type LatestAnalysis = {
  baselineId: string;
  baselineVersionId?: string | null;
  jobId: string;
  overallScore?: number;
  note?: string;
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
  const [resumeComplianceError, setResumeComplianceError] = useState<ParsedComplianceError | null>(null);

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
      setSkipNote(
        "You skipped the Reality Check update flow. Consider reviewing suggested updates later.",
      );
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

    loadRealityCheck();

    return () => {
      cancelled = true;
    };
  }, [jobId, baselineId]);

  const { jobId: resumeJobId, baselineVersionId: resumeBaselineVersionId } = getResumePayload();
  const readyForResume =
    analysisSource === "latest" &&
    Boolean(resumeJobId && resumeBaselineVersionId && !loading && !loadingLatest);

  const oneTapEligible = (latest?.overallScore ?? 0) >= 92;
  const latestStatusMessage = loadingLatest
    ? "Loading latest analysis..."
    : latestEndpoint
      ? `Calling: ${latestEndpoint}`
      : "Ready to load data";

  const encoding = (value: string) => encodeURIComponent(value);
  const runRealityCheckPath =
    jobId && baselineId
      ? `/results/${encoding(jobId)}/reality-check?baselineId=${encoding(baselineId)}`
      : "/results";
  const suggestedSectionsParam = encodeURIComponent(
    (realityCheck?.suggestedBaselineSections ?? []).join(","),
  );
  const baselineUpdatePath = baselineId
    ? `/baseline/${baselineId}?jobId=${encoding(jobId)}&suggestedSections=${suggestedSectionsParam}`
    : "/baseline";
  const fitReviewPath = jobId ? `/fit-review?jobId=${encoding(jobId)}` : "/fit-review";
  const analysisScore = latest?.overallScore ?? 100;
  const analysisIndicatesGap = analysisScore < 85;
  const showRealityCheckCard =
    !baselineId ||
    (baselineId &&
      jobId &&
      (analysisIndicatesGap ||
        !realityCheck ||
        realityCheck.outcome !== RealityCheckOutcome.VALID));

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
                  ? "Checking…"
                  : realityCheck
                    ? realityCheck.outcome.replace("_", " ")
                    : "Not run"}
              </span>
            </div>
            <div className="text-sm text-slate-300 space-y-2">
              {!baselineId ? (
                <p>
                  Upload a baseline so Reality Check can verify its freshness before you generate
                  outputs.
                </p>
              ) : realityCheck ? (
                realityCheck.outcome === RealityCheckOutcome.UPDATE_RECOMMENDED ? (
                  <p>
                    Reality Check flagged sections that may be outdated. Review the suggested updates
                    before generating outputs.
                  </p>
                ) : (
                  <p>
                    This role appears mismatched against your current baseline. View the Fit Review to
                    understand the gap before proceeding.
                  </p>
                )
              ) : analysisIndicatesGap ? (
                <p>
                  Latest analysis score ({analysisScore}) indicates potential gaps. Run Reality Check
                  to confirm whether your baseline still reflects reality.
                </p>
              ) : (
                <p>
                  Reality Check has not been run for the current baseline and job. Run it now to make
                  sure your baseline is still accurate.
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
                <FormButton onClick={() => router.push(runRealityCheckPath)}>
                  Run Reality Check
                </FormButton>
              )}
            </div>
          </section>
        ) : null}

        {tierGateError ? <TierGateNotice error={tierGateError} /> : null}
        {complianceError ? <ComplianceViolationPanel error={complianceError} /> : null}
        {error ? (
          <Alert intent="error" title="Uh oh">
            {error}
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
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
                    Edit the baseline/job IDs to reuse a specific analysis. Loading the latest will
                    overwrite the values you entered.
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Latest analysis
                </p>
                <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
              </div>
              <div className="text-xs text-slate-400">
                <div>Job: {latest?.jobId ?? "n/a"}</div>
                <div>Fit Score: {latest?.overallScore ?? "n/a"}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <FormButton
                variant="ghost"
                onClick={() => {
                  if (latest?.jobId) {
                    window.location.href =
                      "/fit-review?jobId=" + encodeURIComponent(latest.jobId);
                  }
                }}
                disabled={!latest?.jobId}
              >
                Open Fit Review
              </FormButton>
              <p className="text-xs text-slate-400">Review the latest match details in Fit Review.</p>
            </div>
            {latest ? (
              <pre className="rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-200 whitespace-pre-wrap">
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

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Generate resume
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Output</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <FormButton onClick={() => void generateResume(false)} disabled={!readyForResume || loading}>
                {loading ? "Generating..." : "Generate resume"}
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
            <p className="text-[11px] text-slate-400">
              One tap generation is only enabled when the fit score is at least 92 and the latest analysis is ready. Manual generation remains available otherwise.
            </p>
            {resumeTierGateError ? <TierGateNotice error={resumeTierGateError} /> : null}
            {resumeComplianceError ? <ComplianceViolationPanel error={resumeComplianceError} /> : null}
            {resumeError ? (
              <Alert intent="error" title="Unable to generate resume">
                {resumeError}
              </Alert>
            ) : null}
            {resumeResponse ? (
              <pre className="rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-200 whitespace-pre-wrap">
                {JSON.stringify(resumeResponse, null, 2)}
              </pre>
            ) : (
              <EmptyState
                title="No resume yet"
                body="Generate or export a resume to view the payload."
                cta={
                  <FormButton
                    onClick={() => void generateResume(false)}
                    disabled={!baselineId || !jobId || loading}
                  >
                    Generate now
                  </FormButton>
                }
                className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
              />
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
