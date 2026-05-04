"use client";

import { WorkflowAuthorityPanel } from "@/components/workflow/WorkflowAuthorityPanel";

export type GenerationReadyShellFailure = {
  category: string | null;
  retryable: boolean;
  message: string;
};

export function GenerationReadyShell(props: {
  fitScore: number | null;
  readinessState: string;
  evidenceStatus: string;
  phase: "ready" | "generating" | "failed";
  failure: GenerationReadyShellFailure | null;
  onGenerate: () => void;
  onOpenWorkspace: () => void;
  onRetry: () => void;
  onReturnToEvidence: () => void;
  disableActions?: boolean;
}) {
  const disable = Boolean(props.disableActions);
  const trustLine = `Fit score: ${typeof props.fitScore === "number" ? Math.round(props.fitScore) : "unknown"} • Readiness: ${props.readinessState} • ${props.evidenceStatus}`;
  const supporting = (
    <details
      className="rounded-2xl border border-white/10 bg-slate-950/20 p-4 text-sm text-slate-100"
      data-testid="studio-generation-ready-trust"
    >
      <summary className="cursor-pointer font-semibold text-slate-100">Why this output is grounded</summary>
      <p className="mt-2">{trustLine}</p>
    </details>
  );

  if (props.phase === "generating") {
    return (
      <WorkflowAuthorityPanel
        testId="studio-generation-ready-shell"
        eyebrow="Generating"
        model={{
          canonicalState: "generation_in_progress",
          headline: "Generating your documents...",
          body: "We’re building your tailored resume and cover letter now.",
          trustTone: "in_progress",
        }}
        supporting={supporting}
      />
    );
  }

  if (props.phase === "failed") {
    const retryable = props.failure?.retryable ?? false;
    return (
      <WorkflowAuthorityPanel
        testId="studio-generation-ready-shell"
        eyebrow="Failure"
        model={{
          canonicalState: "generation_failed",
          headline: "Document generation failed.",
          body: "Generation didn't complete from the current inputs. Retry generation, or return to evidence to clear the blocker.",
          trustTone: "failure",
        }}
        supporting={
          <div className="space-y-3">
            {props.failure?.message ? (
              <p className="text-sm text-rose-200" data-testid="studio-generation-ready-failure-message">
                {props.failure.message}
              </p>
            ) : null}
            {supporting}
          </div>
        }
        primaryAction={{
          label: retryable ? "Retry generation" : "Fix evidence gaps",
          onClick: retryable ? props.onRetry : props.onReturnToEvidence,
          disabled: disable,
          testId: "studio-generation-ready-primary",
        }}
        secondaryAction={{
          label: "Generate documents",
          onClick: props.onOpenWorkspace,
          disabled: disable,
          testId: "studio-generation-ready-secondary",
          variant: "secondary",
        }}
      />
    );
  }

  return (
    <WorkflowAuthorityPanel
      testId="studio-generation-ready-shell"
      eyebrow="Ready"
      model={{
        canonicalState: "generation_ready",
        headline: "You're ready to generate",
        body: "Your baseline and fit score meet the requirements. Generate your documents when you're ready.",
        trustTone: "ready",
      }}
      supporting={supporting}
      secondaryAction={{
        label: "Generate documents",
        onClick: props.onOpenWorkspace,
        disabled: disable,
        testId: "studio-generation-ready-secondary",
        variant: "secondary",
      }}
    />
  );
}
