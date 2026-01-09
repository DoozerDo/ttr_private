import Link from "next/link";

import type { InterviewResource } from "@/lib/interviewToolkit/resources";

type ResourcesListProps = {
  resources: InterviewResource[];
};

const kindLabels: Record<InterviewResource["kind"], string> = {
  article: "Article",
  video: "Video",
  tool: "Tool",
  doc: "Doc",
};

export function ResourcesList({ resources }: ResourcesListProps) {
  return (
    <div className="space-y-3">
      {resources.map((resource) => (
        <Link
          key={resource.id}
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-200 transition hover:border-white/30"
        >
          <div className="space-y-1">
            <p className="font-semibold text-white">{resource.title}</p>
            {resource.tags?.length ? (
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{resource.tags.join(" · ")}</p>
            ) : null}
          </div>
          <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-300">
            {kindLabels[resource.kind]}
          </span>
        </Link>
      ))}
    </div>
  );
}
