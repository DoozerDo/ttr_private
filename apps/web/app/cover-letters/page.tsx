// apps/web/app/cover-letters/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { BaselineDto } from "../../lib/baselines";
import type { JobDto } from "../../lib/jobs";
import { coverLetterClosingTemplates, defaultClosingTemplateKey } from "../../lib/coverLetters";
import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";

type CoverLetterDto = {
  id: string;
  baselineId: string;
  jobId: string;
  content: string;
  createdAt: string;
  generatorType?: string;
  generatorVersion?: string;
  closingTemplateKey?: string;
};

type LoadState = "idle" | "loading" | "error";

type SelectOption = { value: string; label: string };

function formatJob(job: JobDto | undefined) {
  if (!job) return "Untitled job";
  if (job.title && job.company) return `${job.title} @ ${job.company}`;
  if (job.title) return job.title;
  if (job.company) return job.company;
  return "Untitled job";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CoverLettersPage() {
  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [baselineState, setBaselineState] = useState<LoadState>("loading");
  const [baselineError, setBaselineError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [jobId, setJobId] = useState("");
  const [jobState, setJobState] = useState<LoadState>("loading");
  const [jobError, setJobError] = useState<string | null>(null);

  const [history, setHistory] = useState<CoverLetterDto[]>([]);
  const [historyState, setHistoryState] = useState<LoadState>("loading");
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [closingTemplateKey, setClosingTemplateKey] = useState(defaultClosingTemplateKey);
  const [complianceFlags, setComplianceFlags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadBaselines = async () => {
      setBaselineState("loading");
      setBaselineError(null);

      try {
        const response = await fetch("/api/baselines", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load baselines.");
        }

        const data = (await response.json()) as BaselineDto[];
        if (cancelled) return;

        setBaselines(data);
        setBaselineId((current) => {
          if (current && data.some((baseline) => baseline.id === current)) return current;
          return data[0]?.id ?? "";
        });
        setBaselineState("idle");
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load baselines.";
        setBaselines([]);
        setBaselineId("");
        setBaselineError(message);
        setBaselineState("error");
      }
    };

    loadBaselines();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      setJobState("loading");
      setJobError(null);

      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load jobs.");
        }

        const data = (await response.json()) as JobDto[];
        if (cancelled) return;

        setJobs(data);
        setJobId((current) => {
          if (current && data.some((job) => job.id === current)) return current;
          return data[0]?.id ?? "";
        });
        setJobState("idle");
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load jobs.";
        setJobs([]);
        setJobId("");
        setJobError(message);
        setJobState("error");
      }
    };

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setHistoryState("loading");
      setHistoryError(null);

      try {
        const response = await fetch("/api/cover-letters", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load history.");
        }

        const data = (await response.json()) as CoverLetterDto[];
        if (cancelled) return;

        setHistory(data);
        setHistoryState("idle");
        const latestTemplate = data[0]?.closingTemplateKey;
        setClosingTemplateKey((current) => current || latestTemplate || defaultClosingTemplateKey);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to load history.";
        setHistory([]);
        setHistoryState("error");
        setHistoryError(message);
        setStatusMessage(null);
        setErrorMessage(message);
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [history],
  );

  useEffect(() => {
    if (sortedHistory.length === 0) {
      setSelectedLetterId(null);
      return;
    }

    setSelectedLetterId((current) => {
      if (current && sortedHistory.some((item) => item.id === current)) return current;
      return sortedHistory[0]?.id ?? null;
    });
  }, [sortedHistory]);

  const selectedLetter = useMemo(
    () => sortedHistory.find((item) => item.id === selectedLetterId) ?? null,
    [sortedHistory, selectedLetterId],
  );

  const baselineLabel = useMemo(() => {
    if (baselineState === "loading") return "Loading baselines...";
    if (baselineState === "error") return "Baselines unavailable";
    return baselines.length ? "Choose a baseline" : "No baselines available";
  }, [baselineState, baselines.length]);

  const jobLabel = useMemo(() => {
    if (jobState === "loading") return "Loading jobs...";
    if (jobState === "error") return "Jobs unavailable";
    return jobs.length ? "Choose a job" : "No jobs available";
  }, [jobState, jobs.length]);

  const canGenerate = Boolean(baselineId && jobId && !isGenerating);

  const handleGenerate = async () => {
    if (!baselineId || !jobId) {
      setStatusMessage(null);
      setErrorMessage("Select a baseline and job to generate a cover letter.");
      setComplianceFlags([]);
      return;
    }

    setIsGenerating(true);
    setStatusMessage(null);
    setErrorMessage(null);
    setComplianceFlags([]);

    try {
      const response = await fetch("/api/cover-letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId, jobId, closingTemplateKey }),
      });

      if (!response.ok) {
        const text = await response.text();
        let parsed: any = null;

        try {
          parsed = JSON.parse(text);
        } catch (error) {
          // ignore parsing issues and use fallback messaging
        }

        const message =
          parsed?.error?.message ||
          parsed?.message ||
          (typeof parsed === "string" ? parsed : null) ||
          text ||
          "Unable to generate a cover letter right now.";

        const flags =
          parsed?.error?.details?.compliance_flags ||
          parsed?.details?.compliance_flags ||
          parsed?.complianceFlags ||
          [];

        setComplianceFlags(
          Array.isArray(flags)
            ? flags.map((flag: any) => flag?.message || flag?.code || "Compliance validation failed.")
            : [],
        );

        throw new Error(message);
      }

      const data = (await response.json()) as CoverLetterDto;
      setHistory((current) => {
        const filtered = current.filter((item) => item.id !== data.id);
        return [data, ...filtered];
      });
      setSelectedLetterId(data.id);
      setStatusMessage("Cover letter generated successfully.");
      setClosingTemplateKey(data.closingTemplateKey || closingTemplateKey);
      setComplianceFlags([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to generate.";
      setErrorMessage(message);
      setStatusMessage(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderSelect = (label: string, value: string, options: SelectOption[], onChange: (next: string) => void, disabled: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={ttrComponents.fieldLabel}>{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          ...ttrComponents.input,
          background: "rgba(0,0,0,0.35)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        disabled={disabled}
      >
        {options.length === 0 ? <option value="">No options</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  const renderHistoryItem = (item: CoverLetterDto) => {
    const job = jobs.find((j) => j.id === item.jobId);
    const baseline = baselines.find((b) => b.id === item.baselineId);
    const isActive = item.id === selectedLetterId;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setSelectedLetterId(item.id)}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          width: "100%",
          textAlign: "left",
          borderRadius: 12,
          border: isActive ? "1px solid rgba(251,191,36,0.7)" : "1px solid rgba(255,255,255,0.08)",
          background: isActive ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.03)",
          padding: "10px 12px",
          color: "rgba(226,232,240,0.92)",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{formatJob(job)}</span>
          <span style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>{formatDate(item.createdAt)}</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...ttrComponents.chip, margin: 0 }}>
            Baseline: {baseline?.originalFilename || "Untitled"}
          </span>
          {job?.title ? (
            <span style={{ ...ttrComponents.chip, margin: 0 }}>
              Role: {job.title}
            </span>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <InstrumentShell
      kicker="Applications"
      title="Cover letter studio"
      subtitle="Generate targeted cover letters and review your recent runs."
      rightSlot={
        <Link href="/jobs/new" style={ttrComponents.secondaryButton}>
          Add a job
        </Link>
      }
    >
      <div style={{ ...ttrLayout.panelsRow, alignItems: "stretch" }}>
        <section style={ttrComponents.basePanel}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <span style={ttrTypography.subtleLabel}>Generator</span>
            <h2 style={ttrTypography.h2}>Create a cover letter</h2>
            <p style={ttrTypography.paragraph}>
              Select a baseline and job to craft a tailored cover letter. Generated content is saved to your history for quick review.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {renderSelect(
              baselineLabel,
              baselineId,
              baselines.map((baseline) => ({ value: baseline.id, label: baseline.originalFilename || "Untitled baseline" })),
              setBaselineId,
              baselineState !== "idle",
            )}
            {baselineState === "error" && baselineError ? <div style={ttrComponents.dangerBox}>{baselineError}</div> : null}
            {baselineState === "idle" && baselines.length === 0 ? (
              <div style={{ ...ttrComponents.successBox, borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.08)", color: "rgba(251,191,36,0.95)" }}>
                No baselines available. Upload a baseline to start generating cover letters.
              </div>
            ) : null}

            {renderSelect(
              jobLabel,
              jobId,
              jobs.map((job) => ({ value: job.id, label: formatJob(job) })),
              setJobId,
              jobState !== "idle",
            )}
            {jobState === "error" && jobError ? <div style={ttrComponents.dangerBox}>{jobError}</div> : null}
            {jobState === "idle" && jobs.length === 0 ? (
              <div style={{ ...ttrComponents.successBox, borderColor: "rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.08)", color: "rgba(251,191,36,0.95)" }}>
                No jobs found. Add a job to generate a tailored cover letter.
              </div>
            ) : null}

            {renderSelect(
              "Choose a closing template",
              closingTemplateKey,
              coverLetterClosingTemplates.map((template) => ({
                value: template.key,
                label: `${template.label} – ${template.text}`,
              })),
              setClosingTemplateKey,
              false,
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  ...ttrComponents.primaryButton,
                  opacity: canGenerate ? 1 : 0.6,
                  cursor: canGenerate ? "pointer" : "not-allowed",
                  minWidth: 180,
                }}
              >
                {isGenerating ? "Generating..." : "Generate"}
              </button>
              <span style={{ fontSize: 12, color: "rgba(226,232,240,0.75)" }}>
                Uses your latest baseline version automatically.
              </span>
            </div>

            {statusMessage ? <div style={ttrComponents.successBox}>{statusMessage}</div> : null}
            {errorMessage ? <div style={ttrComponents.dangerBox}>{errorMessage}</div> : null}
            {complianceFlags.length ? (
              <div style={{ ...ttrComponents.dangerBox, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 700 }}>Compliance flags</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
                  {complianceFlags.map((flag, index) => (
                    <li key={`${flag}-${index}`} style={{ fontSize: 13, lineHeight: 1.5 }}>
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <section style={{ ...ttrComponents.basePanel, flex: "1 1 320px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
            <span style={ttrTypography.subtleLabel}>History</span>
            <h2 style={ttrTypography.h2}>Recent cover letters</h2>
            <p style={ttrTypography.paragraph}>
              Tap an entry to load it into the viewer. Newest items appear first.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {historyState === "loading" ? (
              <div style={{ color: "rgba(226,232,240,0.7)", fontSize: 13 }}>Loading history...</div>
            ) : null}
            {historyState === "error" ? (
              <div style={ttrComponents.dangerBox}>{historyError || "Unable to load history right now."}</div>
            ) : null}
            {historyState === "idle" && sortedHistory.length === 0 ? (
              <div style={{ color: "rgba(226,232,240,0.7)", fontSize: 13 }}>No cover letters yet. Generate one to see it listed here.</div>
            ) : null}

            {sortedHistory.map((item) => renderHistoryItem(item))}
          </div>
        </section>
      </div>

      <section style={{ ...ttrComponents.basePanel, marginTop: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          <span style={ttrTypography.subtleLabel}>Output</span>
          <h2 style={ttrTypography.h2}>Cover letter</h2>
          <p style={ttrTypography.paragraph}>
            Review the generated cover letter. Click items in your history to swap between versions.
          </p>
        </div>

        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(15,23,42,0.6)",
            padding: 16,
            minHeight: 220,
            whiteSpace: "pre-wrap",
            color: "rgba(226,232,240,0.92)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            lineHeight: 1.6,
          }}
        >
          {selectedLetter ? selectedLetter.content : "Select a history item or generate a cover letter to view it here."}
        </div>
      </section>
    </InstrumentShell>
  );
}
