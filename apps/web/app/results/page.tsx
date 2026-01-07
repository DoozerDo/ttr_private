"use client";

import { useEffect, useMemo, useState } from "react";
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

type LatestAnalysis = {
  baselineId: string;
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
  const [complianceError, setComplianceError] =
    useState<ParsedComplianceError | null>(null);
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);

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

    setLoadingLatest(true);
    setError(null);
    setLatest(null);

    try {
      if (!latestEndpoint) throw new Error("Job ID is required.");

      const res = await fetch(
        `/api/analysis/job/${encodeURIComponent(jobId)}/latest`,
        { cache: "no-store" },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data: LatestAnalysis = await res.json();
      setLatest(data);

      if (data?.baselineId) {
        setBaselineId(data.baselineId);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load analysis");
    } finally {
      setLoadingLatest(false);
    }
  }

  async function generateResume(oneTap = false) {
    if (!baselineId || !jobId) {
      setError("Baseline and Job are required to generate a resume.");
      return;
    }

    setLoading(true);
    setError(null);
    setResumeResponse(null);
    setComplianceError(null);
    setTierGateError(null);

    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baselineId,
          jobId,
          oneTap,
        }),
      });

      if (!res.ok) {
        const payload = await readResponsePayload(res);
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
      setError(e?.message || "Resume generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function exportResume(format: "docx" | "pdf") {
    if (!baselineId || !jobId) {
      setError("Baseline and Job are required to generate a resume.");
      return;
    }

    setExporting(format);
    setError(null);
    setComplianceError(null);
    setTierGateError(null);

    try {
      const res = await fetch(`/api/resume/export?format=${encodeURIComponent(format)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baselineId,
          jobId,
          oneTap: true,
        }),
      });

      if (!res.ok) {
        const payload = await readResponsePayload(res);
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
      setError(e?.message || "Resume export failed");
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const job = params.get("jobId");
    if (job) {
      setJobId(job);
    }
  }, []);

  const oneTapEligible = (latest?.overallScore ?? 0) >= 92;
  const latestStatusMessage = loadingLatest
    ? "Loading latest analysis..."
    : latestEndpoint
      ? `Calling: ${latestEndpoint}`
      : "Ready to load data";

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Results"
          description="Generate resumes, review the latest analysis, and export artifacts for any job."
        />

        {tierGateError ? <TierGateNotice error={tierGateError} /> : null}
        {complianceError ? <ComplianceViolationPanel error={complianceError} /> : null}
        {error ? <Alert intent="error" title="Uh oh">{error}</Alert> : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Selection</p>
              <h2 className="text-lg font-semibold text-slate-100">Latest IDs</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Baseline</label>
                <TextInput
                  value={baselineId}
                  onChange={(event) => setBaselineId(event.target.value)}
                  placeholder="Baseline ID"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Job</label>
                <TextInput
                  value={jobId}
                  onChange={(event) => setJobId(event.target.value)}
                  placeholder="Job ID"
                />
              </div>
            </div>
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
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Latest analysis</p>
                <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
              </div>
              <div className="text-xs text-slate-400">
                <div>Job: {latest?.jobId ?? 'n/a'}</div>
                <div>Fit Score: {latest?.overallScore ?? 'n/a'}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <FormButton
                variant="ghost"
                onClick={() => {
                  if (latest?.jobId) {
                    window.location.href = '/fit-review?jobId=' + encodeURIComponent(latest.jobId);
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
                  <FormButton variant="ghost" onClick={() => void loadLatest()} disabled={!jobId || loading || loadingLatest}>
                    {loadingLatest ? "Loading latest..." : "Load analysis"}
                  </FormButton>
                }
                className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
              />
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Generate resume</p>
              <h2 className="text-lg font-semibold text-slate-100">Output</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <FormButton
                onClick={() => generateResume(false)}
                disabled={!baselineId || !jobId || loading}
              >
                {loading ? 'Generating...' : 'Generate resume'}
              </FormButton>
              <FormButton
                variant="secondary"
                onClick={() => generateResume(true)}
                disabled={!baselineId || !jobId || !oneTapEligible || loading}
                title={
                  oneTapEligible
                    ? 'Generate immediately with compliance checks'
                    : 'Requires fit score of at least 92'
                }
              >
                {loading ? 'Checking...' : 'One tap generate (>=92 fit score)'}
              </FormButton>
            </div>
            <div className="flex flex-wrap gap-3">
              <FormButton
                variant="secondary"
                onClick={() => exportResume('docx')}
                disabled={!baselineId || !jobId || !oneTapEligible || !!exporting}
              >
                {exporting === 'docx' ? 'Downloading...' : 'Download DOCX'}
              </FormButton>
              <FormButton
                variant="secondary"
                onClick={() => exportResume('pdf')}
                disabled={!baselineId || !jobId || !oneTapEligible || !!exporting}
              >
                {exporting === 'pdf' ? 'Downloading...' : 'Download PDF'}
              </FormButton>
            </div>
            {resumeResponse ? (
              <pre className="rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-200 whitespace-pre-wrap">
                {JSON.stringify(resumeResponse, null, 2)}
              </pre>
            ) : (
              <EmptyState
                title="No resume yet"
                body="Generate or export a resume to view the payload."
                cta={
                  <FormButton onClick={() => generateResume(false)} disabled={!baselineId || !jobId || loading}>
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
