"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

import type { JobDto } from "@/lib/jobs";
import { archiveJob, listJobs, restoreJob } from "@/lib/jobsClient";
import { getJobDetailsHref } from "@/src/navigation/routes";

function isArchived(job: JobDto): boolean {
  const record = job as unknown as Record<string, unknown>;

  const archivedFlag = record["isArchived"];
  if (typeof archivedFlag === "boolean") return archivedFlag;

  const status = record["status"];
  if (typeof status === "string" && status.toUpperCase() === "ARCHIVED") return true;

  const archivedAt = record["archivedAt"];
  if (typeof archivedAt === "string" && archivedAt.trim().length > 0) return true;

  return false;
}

function formatDate(dateIso?: string | null) {
  if (!dateIso) return "Not provided";
  try {
    return new Date(dateIso).toLocaleString();
  } catch {
    return "Not provided";
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await listJobs({ includeArchived: true });
      setJobs(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load jobs");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleJobs = useMemo(() => {
    if (showArchived) return jobs;
    return jobs.filter((job) => !isArchived(job));
  }, [jobs, showArchived]);

  const onArchive = useCallback(
    async (jobId: string) => {
      setBusyJobId(jobId);
      setError(null);
      setSuccessMessage(null);

      try {
        const updated = await archiveJob(jobId);
        await load();
        setSuccessMessage(
          updated?.title ? `${updated.title} archived` : "Job archived",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Archive failed");
      } finally {
        setBusyJobId(null);
      }
    },
    [load],
  );

  const onRestore = useCallback(
    async (jobId: string) => {
      setBusyJobId(jobId);
      setError(null);
      setSuccessMessage(null);

      try {
        const updated = await restoreJob(jobId);
        await load();
        setSuccessMessage(
          updated?.title ? `${updated.title} restored` : "Job restored",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Restore failed");
      } finally {
        setBusyJobId(null);
      }
    },
    [load],
  );

  return (
    <PageShell>
      <div className="space-y-8">
        <PageHeader
          kicker="Jobs"
          title="Jobs"
          description="Track roles you care about and keep your work tied to the right opportunities."
          rightSlot={
            <Link
              href="/jobs/new"
              className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/20"
            >
              Add or import a job
            </Link>
          }
        />

        {error ? (
          <Alert intent="error" title="Jobs error">
            <p className="text-sm text-current">{error}</p>
          </Alert>
        ) : null}

        {successMessage ? (
          <Alert intent="success">
            <p className="text-sm text-current">{successMessage}</p>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-300"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>

          <div className="ml-auto flex items-center gap-2">
            <FormButton
              variant="secondary"
              onClick={() => {
                void load();
              }}
              disabled={isLoading}
            >
              {isLoading ? "Refreshing" : "Refresh"}
            </FormButton>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 text-sm text-slate-200">
            Loading jobs
          </div>
        ) : visibleJobs.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            body={
              showArchived
                ? "No archived jobs found."
                : "Add a job to start building your target workspace."
            }
            cta={
              <Link
                href="/jobs/new"
                className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/20"
              >
                Add a job
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40">
            <div className="grid grid-cols-12 gap-4 border-b border-white/10 bg-slate-950/40 px-6 py-3 text-xs uppercase tracking-[0.25em] text-slate-400">
              <div className="col-span-5">Title</div>
              <div className="col-span-3">Company</div>
              <div className="col-span-2">Created</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            <ul className="divide-y divide-white/5">
              {visibleJobs.map((job) => {
                const archived = isArchived(job);
                const isBusy = busyJobId === job.id;

                return (
                  <li key={job.id} className="px-6 py-4">
                    <div className="grid grid-cols-12 items-start gap-4">
                      <div className="col-span-5">
                        <div className="flex items-center gap-2">
                        <Link
                          href={getJobDetailsHref(job.id)}
                          className="text-sm font-semibold text-slate-100 underline decoration-white/10 underline-offset-4 hover:decoration-white/40"
                        >
                            {job.title || "Untitled job"}
                          </Link>
                          {archived ? (
                            <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 text-xs font-semibold text-slate-300">
                              Archived
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          Ingestion method: {job.jdIngestionMethod}
                        </p>
                      </div>

                      <div className="col-span-3">
                        <p className="text-sm text-slate-200">
                          {job.company || "Not provided"}
                        </p>
                        {job.sourceUrl ? (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block truncate text-xs font-semibold text-sky-300 underline"
                          >
                            Source url
                          </a>
                        ) : null}
                      </div>

                      <div className="col-span-2 text-sm text-slate-200">
                        {formatDate(job.createdAt)}
                      </div>

                      <div className="col-span-2 flex justify-end gap-2">
                        <Link
                          href={getJobDetailsHref(job.id)}
                          className="rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/50"
                        >
                          View details
                        </Link>

                        {archived ? (
                          <FormButton
                            variant="secondary"
                            onClick={() => {
                              void onRestore(job.id);
                            }}
                            disabled={isBusy}
                          >
                            {isBusy ? "Restoring" : "Restore"}
                          </FormButton>
                        ) : (
                          <FormButton
                            variant="secondary"
                            onClick={() => {
                              void onArchive(job.id);
                            }}
                            disabled={isBusy}
                          >
                            {isBusy ? "Archiving" : "Archive"}
                          </FormButton>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </PageShell>
  );
}
