"use client";

import type { WorkflowActivitySnapshot, WorkflowActivityOperation } from "@/lib/workflowActivityTracker";

function resolveCopy(operation: WorkflowActivityOperation) {
  if (operation === "analysis_running") {
    return {
      headline: "Analyzing your fit...",
      body: "We’re evaluating your experience against the role.",
    };
  }
  if (operation === "unlock_reanalysis_running") {
    return {
      headline: "Re-evaluating your updates...",
      body: "Checking if your new experience clears the blocker.",
    };
  }
  return {
    headline: "Generating your documents...",
    body: "We're building your tailored resume and cover letter now.",
  };
}

function pickHighestPriority(operations: WorkflowActivityOperation[]): WorkflowActivityOperation | null {
  if (operations.includes("generation_running")) return "generation_running";
  if (operations.includes("unlock_reanalysis_running")) return "unlock_reanalysis_running";
  if (operations.includes("analysis_running")) return "analysis_running";
  return null;
}

export function WorkflowActivityBanner(props: {
  tracker: WorkflowActivitySnapshot;
  testId?: string;
}) {
  if (!props.tracker.isActive) return null;

  const active = pickHighestPriority(props.tracker.activeOperations);
  if (!active) return null;

  const copy = resolveCopy(active);

  return (
    <div
      className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur"
      data-testid={props.testId ?? "workflow-activity-banner"}
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-5xl items-start gap-3 px-4 py-3 sm:px-6">
        <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-slate-200/30 border-t-slate-100" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-50">{copy.headline}</p>
          <p className="mt-0.5 text-sm text-slate-200">{copy.body}</p>
        </div>
      </div>
    </div>
  );
}
