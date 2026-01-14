"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import Link from "next/link";

import { Alert } from "@/components/Alert";
import type { JobDto } from "@/lib/jobs";
import { InstrumentPanelShell } from "@/app/(app)/ui/InstrumentPanelShell";
import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";
import { getJobDetailsHref } from "@/src/navigation/routes";

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

type IngestionMode = "PASTE" | "URL";

type IngestPreview = {
  rawDescription: string;
  responsibilities: string[];
  requirements: string[];
};

export default function JobIngestionPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawDescription, setRawDescription] = useState("");
  const [url, setUrl] = useState("");
  const [ingestionMode, setIngestionMode] = useState<IngestionMode>("PASTE");
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [jobs],
  );

  const isUrlMode = ingestionMode === "URL";
  const canPreview = isUrlMode ? url.trim().length > 0 : rawDescription.trim().length > 0;
  const canSubmit =
    (isUrlMode ? url.trim().length > 0 : rawDescription.trim().length > 0) &&
    !isSubmitting &&
    !isPreviewing;

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      setJobsLoading(true);
      setJobsError(null);

      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        if (!response.ok) {
          const message = (await response.text()) || "Unable to load job descriptions.";
          throw new Error(message);
        }

        const data = (await response.json()) as JobDto[];
        if (!cancelled) {
          setJobs(data);
        }
    } catch (loadError) {
      if (cancelled) return;
      setJobs([]);
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load job descriptions right now.";
      setJobsError(message);
    } finally {
      if (!cancelled) setJobsLoading(false);
    }
    };

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = () => {
    setTitle("");
    setCompany("");
    setRawDescription("");
    setUrl("");
    setPreview(null);
    setIngestionMode("PASTE");
  };

  const requestPreview = async (payload: { url?: string; pastedText?: string }, shouldSet = true) => {
    setIsPreviewing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/jobs/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return null;
      }

      if (!response.ok) {
        const message = data?.message || data?.error || "Unable to parse job description";
        setError(typeof message === "string" ? message : "Unable to parse job description");
        return null;
      }

      if (shouldSet) {
        setPreview(data as IngestPreview);
      }

      return data as IngestPreview;
    } catch {
      setError("Unable to parse job description right now.");
      return null;
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePreview = async () => {
    if (isUrlMode) {
      if (!url.trim()) {
        setError("Please add a job description URL before previewing.");
        return;
      }
      await requestPreview({ url: url.trim() });
      return;
    }

    if (!rawDescription.trim()) {
      setError("Please paste a job description before previewing.");
      return;
    }

    await requestPreview({ pastedText: rawDescription });
  };

  const handleModeChange = (mode: IngestionMode) => {
    setIngestionMode(mode);
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    let previewPayload = preview;
    const trimmedUrl = url.trim();

    if (isUrlMode) {
      if (!trimmedUrl) {
        setError("Please add a job description URL before saving.");
        return;
      }
      if (!previewPayload) {
        previewPayload = await requestPreview({ url: trimmedUrl }, false);
        if (!previewPayload) {
          return;
        }
      }
    } else if (!rawDescription.trim()) {
      setError("Please paste a job description before saving.");
      return;
    }

    const finalRawDescription =
      isUrlMode ? previewPayload?.rawDescription ?? "" : previewPayload?.rawDescription ?? rawDescription;

    if (!finalRawDescription) {
      setError("Please provide a job description before saving.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          company,
          rawDescription: finalRawDescription,
          sourceUrl: isUrlMode ? trimmedUrl : null,
          responsibilities: previewPayload?.responsibilities,
          requirements: previewPayload?.requirements,
          jdIngestionMethod: ingestionMode,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return;
      }

      if (!response.ok) {
        const message = data?.message || data?.error || "Unable to save job";
        setError(typeof message === "string" ? message : "Unable to save job");
        return;
      }

      setJobs((previous) => [data as JobDto, ...previous]);
      resetForm();
      setSuccess("Job description saved. Ready to analyze fit.");
    } catch {
      setError("Unable to save job right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const rightSlot = (
    <Link href="/analyze" style={ttrComponents.secondaryButton}>
      Analyze a role
    </Link>
  );

  return (
    <InstrumentPanelShell
      kicker="Job ingestion"
      title="Add a job description"
      subtitle="Paste a job posting or fetch it from a URL to prepare for fit scoring."
      rightSlot={rightSlot}
    >
      <section style={{ ...ttrComponents.basePanel, padding: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <span style={ttrTypography.subtleLabel}>Job intake</span>
          <h2 style={ttrTypography.h2}>Capture the posting</h2>
          <p style={ttrTypography.bodyMuted}>
            Paste the full job description or fetch it from a URL. Title and company are optional
            but helpful for organization later.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {(["PASTE", "URL"] as const).map((mode) => (
              <label
                key={mode}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: ingestionMode === mode ? "rgba(248,250,252,0.95)" : "rgba(148,163,184,0.7)",
                }}
              >
                <input
                  type="radio"
                  name="ingestionMode"
                  value={mode}
                  checked={ingestionMode === mode}
                  onChange={() => handleModeChange(mode)}
                  disabled={isSubmitting || isPreviewing}
                />
                {mode === "PASTE" ? "Paste" : "URL"}
              </label>
            ))}
          </div>

          <div style={fieldStyle}>
            <label style={ttrComponents.fieldLabel} htmlFor="jobTitle">
              Job title (optional)
            </label>
            <input
              id="jobTitle"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Senior Product Designer"
              style={ttrComponents.textInput}
              disabled={isSubmitting}
            />
          </div>

          <div style={fieldStyle}>
            <label style={ttrComponents.fieldLabel} htmlFor="jobCompany">
              Company (optional)
            </label>
            <input
              id="jobCompany"
              type="text"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Acme Health"
              style={ttrComponents.textInput}
              disabled={isSubmitting}
            />
          </div>

          {isUrlMode ? (
            <div style={fieldStyle}>
              <label style={ttrComponents.fieldLabel} htmlFor="jobUrl">
                Job description URL
              </label>
              <input
                id="jobUrl"
                type="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setPreview(null);
                }}
                placeholder="https://company.com/jobs/role"
                style={ttrComponents.textInput}
                disabled={isSubmitting || isPreviewing}
              />
            </div>
          ) : (
            <div style={fieldStyle}>
              <label style={ttrComponents.fieldLabel} htmlFor="jobDescription">
                Job description
              </label>
              <textarea
                id="jobDescription"
                value={rawDescription}
                onChange={(event) => {
                  setRawDescription(event.target.value);
                  setPreview(null);
                }}
                placeholder="Paste the full role description, requirements, and responsibilities."
                style={{ ...ttrComponents.textArea, minHeight: 220 }}
                disabled={isSubmitting || isPreviewing}
              />
            </div>
          )}

          <button
            type="button"
            onClick={handlePreview}
            disabled={isSubmitting || isPreviewing || !canPreview}
            style={{
              ...ttrComponents.secondaryButton,
              width: "fit-content",
              padding: "10px 14px",
              fontSize: 12,
              opacity: isSubmitting || isPreviewing || !canPreview ? 0.7 : 1,
              cursor: isSubmitting || isPreviewing || !canPreview ? "not-allowed" : "pointer",
            }}
          >
            {isPreviewing
              ? "Parsing..."
              : isUrlMode
                ? "Fetch & preview"
                : "Preview parse"}
          </button>

          {error && <div style={ttrComponents.dangerBox}>{error}</div>}
          {success && <div style={ttrComponents.successBox}>{success}</div>}

          {preview && (
            <div style={{ ...ttrComponents.basePanel, padding: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <h3 style={{ ...ttrTypography.h3, margin: 0 }}>Parsed preview</h3>
                <details>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "rgba(226,232,240,0.8)" }}>
                    View extracted description
                  </summary>
                  <p style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "rgba(226,232,240,0.75)" }}>
                    {preview.rawDescription}
                  </p>
                </details>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div>
                    <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600 }}>
                      Responsibilities
                    </p>
                    {preview.responsibilities.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                        No responsibilities detected yet.
                      </p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                        {preview.responsibilities.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600 }}>
                      Requirements
                    </p>
                    {preview.requirements.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                        No requirements detected yet.
                      </p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                        {preview.requirements.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...ttrComponents.primaryButton,
              width: "fit-content",
              padding: "12px 14px",
              fontSize: 13,
              opacity: !canSubmit ? 0.7 : 1,
              cursor: !canSubmit ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Saving..." : "Save job description"}
          </button>
        </form>
      </section>

      <section style={{ ...ttrComponents.basePanel, padding: 18, marginTop: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={ttrTypography.subtleLabel}>Recent</span>
          <h2 style={ttrTypography.h2}>Saved job postings</h2>
          <p style={ttrTypography.bodyMuted}>Your latest job descriptions appear first.</p>
        </div>

        <div style={{ marginTop: 12 }}>
          {jobsLoading ? (
            <p style={{ margin: 0, fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
              Loading saved job descriptions...
            </p>
          ) : jobsError ? (
            <Alert intent="error" title="Unable to load jobs" data-testid="job-list-error">
              <p className="text-sm text-current">{jobsError}</p>
            </Alert>
          ) : sortedJobs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
              No job descriptions saved yet.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {sortedJobs.map((job, index) => (
                <li
                  key={job.id}
                  style={{
                    borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Link
                    href={getJobDetailsHref(job.id)}
                    className="block space-y-1 px-0 py-3 transition hover:text-white"
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        color: "rgba(248,250,252,0.95)",
                      }}
                    >
                      {job.title || "Untitled role"}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
                      {job.company || "Company not specified"}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.55)" }}>
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </InstrumentPanelShell>
  );
}




