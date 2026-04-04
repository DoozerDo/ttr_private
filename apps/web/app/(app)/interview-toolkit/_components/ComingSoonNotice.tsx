"use client";

import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";

export function ComingSoonNotice() {
  return (
    <PageShell>
      <div className="space-y-6 pb-10">
        <PageHeader
          kicker="Interview Toolkit"
          title="Coming Soon"
          description="This beta feature is not available yet. We’re keeping it visible so you know it is part of the roadmap."
        />

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <p className="text-sm text-slate-300">
            Interview Toolkit is not ready for beta access yet. Return to Baseline or Results to keep
            moving through the current product loop.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/baseline"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Go to Baseline
            </Link>
            <Link
              href="/results"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Go to Results
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
