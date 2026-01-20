"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import type { JobDto } from "@/lib/jobs";
import { archiveJob, listJobs } from "@/lib/jobsClient";
import { getJobDetailsHref } from "@/src/navigation/routes";
import { InputCard } from "./InputCard";
import { OverflowMenu } from "./OverflowMenu";
import { setJobTitle } from "./selectionStore";

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

interface JobsHubProps {
  selectedJobId?: string | null;
}

export function JobsHub({ selectedJobId }: JobsHubProps) {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archivingJobId, setArchivingJobId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

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

  const visibleJobs = useMemo(() => jobs.slice(0, 5), [jobs]);
  const selectedJobName = useMemo(
    () => visibleJobs.find((job) => job.id === selectedJobId)?.title ?? null,
    [visibleJobs, selectedJobId],
  );
  useEffect(() => {
    setJobTitle(selectedJobName);
  }, [selectedJobName]);

  const setJobSelection = (jobId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("jobId", jobId);
    const query = params.toString();
    const base = pathname ?? "/baseline";
    const target = query ? `${base}?${query}` : base;
    router.push(target);
    router.refresh();
  };

  const handleArchiveJob = async (jobId: string) => {
    if (archivingJobId === jobId) return;
    setError(null);
    setArchivingJobId(jobId);

    try {
      await archiveJob(jobId);
      setJobs((previous) => previous.filter((job) => job.id !== jobId));
    } catch (archiveError: unknown) {
      console.error("Unable to archive job", archiveError);
      const message =
        archiveError instanceof Error
          ? archiveError.message
          : "Unable to archive job right now.";
      setError(message);
    } finally {
      setArchivingJobId(null);
    }
  };

  const addJobButton = (
    <Link
      href="/jobs/new"
      className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/20"
    >
      Add job
    </Link>
  );

  return (
    <InputCard
      kicker="JOB"
      title="Job description"
      description="Add a job description to score against your baseline."
      primaryAction={addJobButton}
    >
      {error ? (
        <Alert intent="error" title="Jobs error">
          <p className="text-sm text-current">{error}</p>
        </Alert>
      ) : null}

      {selectedJobName ? (
        <p className="text-xs text-slate-400">Selected: {selectedJobName}</p>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 text-sm text-slate-200">
          Loading jobs
        </div>
      ) : visibleJobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          body="Add a job to start building your target workspace."
          cta={
            <Link
              href="/jobs/new"
              className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/20"
            >
              Add job
            </Link>
          }
        />
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40">
          <div className="grid grid-cols-[2fr_220px] gap-4 border-b border-white/10 bg-slate-900/40 px-6 py-3 text-xs uppercase tracking-[0.25em] text-slate-400">
            <div>Title</div>
            <div className="text-right">Actions</div>
          </div>
          <ul className="divide-y divide-white/5">
            {visibleJobs.map((job) => {
              const archived = isArchived(job);
              const isSelected = job.id === selectedJobId;

              return (
                <li key={job.id} className="px-6 py-4">
                  <div className="grid grid-cols-[2fr_220px] items-center gap-4">
                    <div className="min-w-0">
                      <Link
                        href={getJobDetailsHref(job.id)}
                        className="text-sm font-semibold text-slate-100 underline decoration-white/10 underline-offset-4 hover:decoration-white/40"
                      >
                        <span className="truncate">{job.title || "Untitled job"}</span>
                      </Link>
                      {archived ? (
                        <p className="mt-1 text-xs text-slate-400">Archived</p>
                      ) : null}
                    </div>

                    <div className="flex justify-end gap-2">
                      <Link
                        href={getJobDetailsHref(job.id)}
                        className="rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/50"
                    >
                      View details
                    </Link>
                    <FormButton
                      variant="ghost"
                      onClick={() => setJobSelection(job.id)}
                      disabled={isSelected}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </FormButton>
                    {!archived ? (
                      <OverflowMenu
                        onArchive={() => handleArchiveJob(job.id)}
                        loading={archivingJobId === job.id}
                        ariaLabel="Job overflow actions"
                      />
                    ) : null}
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </InputCard>
  );
}
