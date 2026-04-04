import Link from "next/link";

import { Alert } from "@/components/Alert";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { getJob } from "@/lib/jobsClient";
import type { JobDto } from "@/lib/jobs";

type JobDetailPageProps = {
  // Next.js 16+ can provide params as a Promise in Server Components.
  params: Promise<{
    jobId?: string;
  }>;
};

const INGESTION_LABELS: Record<JobDto["jdIngestionMethod"], string> = {
  PASTE: "Paste",
  URL: "URL",
};

function formatDate(dateIso: string) {
  return new Date(dateIso).toLocaleString();
}

function renderValue(value?: string | null) {
  if (!value) return "Not provided";
  return value;
}

// Some environments may return extra fields that are not part of JobDto yet.
// We support them without breaking the build.
function getOptionalStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const resolvedParams = await params;
  const jobId = typeof resolvedParams?.jobId === "string" ? resolvedParams.jobId : "";

  if (!jobId) {
    return (
      <PageShell>
        <div className="space-y-8">
          <PageHeader
            kicker="Jobs"
            title="Job detail"
            description="Invalid job id"
            rightSlot={
              <Link
                href="/jobs"
                className="rounded-2xl border border-white/20 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/50"
              >
                Back to jobs
              </Link>
            }
          />
          <Alert intent="error" title="Unable to load job">
            <p className="text-sm text-current">Missing or invalid job id.</p>
          </Alert>
        </div>
      </PageShell>
    );
  }

  let job: JobDto | null = null;
  let fetchError: string | null = null;

  try {
    job = await getJob(jobId);
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Unable to load job";
  }

  const description = job ? job.company ?? "Company not provided" : undefined;

  // Optional fields that may exist depending on backend shape.
  const sourceProvider = getOptionalStringField(job, "sourceProvider");

  return (
    <PageShell>
      <div className="space-y-8">
        <PageHeader
          kicker="Jobs"
          title={job?.title ?? "Job detail"}
          description={description}
          rightSlot={
            <Link
              href="/jobs"
              className="rounded-2xl border border-white/20 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/50"
            >
              Back to jobs
            </Link>
          }
        />

        {fetchError || !job ? (
          <div className="space-y-4">
            <Alert intent="error" title="Unable to load job">
              <p className="text-sm text-current">{fetchError ?? "Job not found"}</p>
            </Alert>
            <div>
              <Link href="/jobs" className="text-sm font-semibold text-amber-300 underline">
                Back to jobs
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Created</p>
                  <p className="text-base font-semibold text-slate-100">
                    {formatDate(job.createdAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Ingestion method</p>
                  <p className="text-base font-semibold text-slate-100">
                    {INGESTION_LABELS[job.jdIngestionMethod]}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Job id</p>
                  <p className="text-base font-semibold text-slate-100">{job.id}</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Company</p>
                  <p className="text-base font-semibold text-slate-100">{renderValue(job.company)}</p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Title</p>
                  <p className="text-base font-semibold text-slate-100">{renderValue(job.title)}</p>
                </div>

                {sourceProvider ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Source provider</p>
                    <p className="text-base font-semibold text-slate-100">{sourceProvider}</p>
                  </div>
                ) : (
                  <div />
                )}
              </div>

              {job.sourceUrl ? (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Source url</p>
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-sky-300 underline"
                  >
                    {job.sourceUrl}
                  </a>
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Description</p>
              <div className="whitespace-pre-wrap rounded-2xl border border-white/5 bg-slate-950/60 px-4 py-4 text-sm leading-relaxed text-slate-100">
                {job.rawDescription}
              </div>
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}
