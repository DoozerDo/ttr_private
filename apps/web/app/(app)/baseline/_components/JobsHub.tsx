"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { FormButton, SecondaryActionLink } from "@/components/FormButton";
import type { JobDto } from "@/lib/jobs";
import { archiveJob, listJobs } from "@/lib/jobsClient";
import { formatDateTime } from "@/lib/format-date";
import { getJobDetailsHref } from "@/src/navigation/routes";
import { JobIngestionForm } from "@/app/(app)/jobs/_components/JobIngestionForm";
import { OverflowMenu } from "./OverflowMenu";
import { SetupModuleCard } from "./SetupModuleCard";
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
  onJobMissing?: () => void;
}

export function JobsHub({ selectedJobId, onJobMissing }: JobsHubProps) {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archivingJobId, setArchivingJobId] = useState<string | null>(null);
  const [isIngestOpen, setIsIngestOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await listJobs({ includeArchived: true });
      setJobs(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load jobs");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setIsIngestOpen(true);
    };
    window.addEventListener("jobIngestionRequest", handler as EventListener);
    return () => {
      window.removeEventListener("jobIngestionRequest", handler as EventListener);
    };
  }, []);

  const jobMissingNotified = useRef(false);

  useEffect(() => {
    if (!onJobMissing) {
      jobMissingNotified.current = false;
      return;
    }

    if (!selectedJobId) {
      jobMissingNotified.current = false;
      return;
    }

    if (isLoading) return;

    const found = jobs.some((job) => job.id === selectedJobId);
    if (!found && !jobMissingNotified.current) {
      jobMissingNotified.current = true;
      onJobMissing();
    }
  }, [isLoading, jobs, onJobMissing, selectedJobId]);

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
    router.replace(target);
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

  const navigateToAddJob = () => {
    setIsIngestOpen(true);
  };

  return (
    <>
      <SetupModuleCard
        label="JOB DESCRIPTION"
        title=""
        description="Add a job description to score against your resume."
        primaryAction={<FormButton onClick={navigateToAddJob}>Add Job Description</FormButton>}
      >
        {error ? (
          <Alert intent="error" title="Jobs error">
            <p className="text-sm text-current">{error}</p>
          </Alert>
        ) : null}

        {selectedJobName ? (
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
            Selected: {selectedJobName}
          </p>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 text-sm text-slate-200">
            Loading jobs
          </div>
        ) : visibleJobs.length === 0 ? (
          <EmptyState
            title="No jobs yet"
            body="Add a job to start building your target workspace."
            cta={<FormButton onClick={navigateToAddJob}>Add Job Description</FormButton>}
          />
        ) : (
          <div className="space-y-3">
            {visibleJobs.map((job) => {
              const archived = isArchived(job);
              const isSelected = job.id === selectedJobId;
              const cardClasses = [
                "rounded-2xl border border-white/10 bg-slate-950/40 p-4",
                isSelected ? "ring-2 ring-cyan-300/40" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div key={job.id} className={cardClasses}>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={getJobDetailsHref(job.id)}
                        className="block min-w-0 text-sm font-semibold text-slate-100 underline decoration-white/10 underline-offset-4 hover:decoration-white/40"
                      >
                        <span className="block truncate">{job.title || "Untitled job"}</span>
                      </Link>
                      {archived ? (
                        <span className="text-[10px] uppercase tracking-[0.35em] text-slate-400">
                          Archived
                        </span>
                      ) : null}
                    </div>

                    {job.company ? <p className="mt-1 text-xs text-slate-400">{job.company}</p> : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <SecondaryActionLink href={getJobDetailsHref(job.id)}>
                        View details
                      </SecondaryActionLink>
                      <FormButton
                        variant="secondary"
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

                    <p className="mt-3 text-xs text-slate-400">
                      Updated {formatDateTime(job.updatedAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SetupModuleCard>

      {isIngestOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-100">Add Job Description</div>
              <FormButton variant="secondary" onClick={() => setIsIngestOpen(false)}>
                Close
              </FormButton>
            </div>

            <JobIngestionForm
              onCancel={() => setIsIngestOpen(false)}
              onResolved={async (resolvedJobId) => {
                setIsIngestOpen(false);
                await load();
                setJobSelection(resolvedJobId);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
