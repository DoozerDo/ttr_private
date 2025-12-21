"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import Link from "next/link";

import type { JobDto } from "../../../lib/jobs";
import { InstrumentPanelShell } from "../../ui/InstrumentPanelShell";
import { ttrComponents, ttrTypography } from "../../ui/ttrStyles";

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export default function JobIngestionPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawDescription, setRawDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [jobs],
  );

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as JobDto[];
        if (!cancelled) setJobs(data);
      } catch {
        if (!cancelled) setJobs([]);
      }
    };

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!rawDescription.trim()) {
      setError("Please paste a job description before saving.");
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
          rawDescription,
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
      setTitle("");
      setCompany("");
      setRawDescription("");
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
      subtitle="Paste a job posting to prepare for fit scoring."
      rightSlot={rightSlot}
    >
      <section style={{ ...ttrComponents.basePanel, padding: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <span style={ttrTypography.subtleLabel}>Job intake</span>
          <h2 style={ttrTypography.h2}>Capture the posting</h2>
          <p style={ttrTypography.bodyMuted}>
            Paste the full job description. Title and company are optional but helpful for
            organization later.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

          <div style={fieldStyle}>
            <label style={ttrComponents.fieldLabel} htmlFor="jobDescription">
              Job description
            </label>
            <textarea
              id="jobDescription"
              value={rawDescription}
              onChange={(event) => setRawDescription(event.target.value)}
              placeholder="Paste the full role description, requirements, and responsibilities."
              style={{ ...ttrComponents.textArea, minHeight: 220 }}
              disabled={isSubmitting}
            />
          </div>

          {error && <div style={ttrComponents.dangerBox}>{error}</div>}
          {success && <div style={ttrComponents.successBox}>{success}</div>}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              ...ttrComponents.primaryButton,
              width: "fit-content",
              padding: "12px 14px",
              fontSize: 13,
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
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
          {sortedJobs.length === 0 ? (
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
                    padding: "12px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "rgba(248,250,252,0.95)" }}>
                    {job.title || "Untitled role"}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
                    {job.company || "Company not specified"}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.55)" }}>
                    {new Date(job.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </InstrumentPanelShell>
  );
}
