"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import type { JobDto } from "@/lib/jobs";
import { InstrumentPanelShell } from "@/app/(app)/ui/InstrumentPanelShell";
import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";
import { getJobDetailsHref } from "@/src/navigation/routes";
import { JobIngestionForm } from "@/app/(app)/jobs/_components/JobIngestionForm";

const rightSlot = (
  <Link href="/analyze" style={ttrComponents.secondaryButton}>
    Analyze a role
  </Link>
);

export default function JobIngestionPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

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

  return (
    <InstrumentPanelShell
      kicker="Job ingestion"
      title="Add a job description"
      subtitle="Paste a job posting or fetch it from a URL to prepare for fit scoring."
      rightSlot={rightSlot}
    >
      <JobIngestionForm
        onCancel={() => router.back()}
        onResolved={(jobId) => {
          router.push(`/baseline?jobId=${encodeURIComponent(jobId)}`);
        }}
      />

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
