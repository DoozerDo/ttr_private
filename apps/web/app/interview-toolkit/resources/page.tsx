import Link from "next/link";

import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ResourcesList } from "@/app/interview-toolkit/_components/ResourcesList";
import { getInterviewResourcesForJob } from "@/lib/interviewToolkit/resources";

type InterviewResourcesPageProps = {
  searchParams?: {
    jobId?: string | string[];
  };
};

export default function InterviewToolkitResourcesPage({ searchParams }: InterviewResourcesPageProps) {
  const jobIdParam = searchParams?.jobId;
  const jobId = Array.isArray(jobIdParam) ? jobIdParam[0] : jobIdParam;
  const resources = getInterviewResourcesForJob(jobId ?? undefined);

  return (
    <PageShell>
      <div className="space-y-6 pb-10">
        <PageHeader
          kicker="Interview Toolkit"
          title="Resources"
          description="Curated articles, videos, and tools that reinforce your prep for the selected opportunity."
        />
        <div className="text-sm text-slate-400">
          <Link href="/interview-toolkit" className="text-sky-300 underline">
            Back to Interview Toolkit
          </Link>
        </div>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Recommended resources
            </p>
            <h2 className="text-lg font-semibold text-slate-100">Resources</h2>
          </div>
          <p className="text-sm text-slate-300">
            Curated articles, videos, and tools that reinforce your prep for the selected opportunity.
          </p>

          {resources.length > 0 ? (
            <ResourcesList resources={resources} />
          ) : (
            <EmptyState
              title="No study packet"
              body="Select a job to build its study packet."
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          )}
        </section>
      </div>
    </PageShell>
  );
}
