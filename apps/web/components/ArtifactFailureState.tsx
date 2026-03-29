"use client";

import { type StudioArtifactFailurePresentation } from "@/src/lib/studio/helpers";
import { Alert } from "@/components/Alert";

type ArtifactFailureStateProps = {
  failure: StudioArtifactFailurePresentation;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ArtifactFailureState({ failure, onRetry, retryLabel }: ArtifactFailureStateProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-100">{failure.headline}</p>
        <p className="text-sm text-slate-300">{failure.explanation}</p>
        {failure.detail ? <p className="text-xs text-slate-400">{failure.detail}</p> : null}
      </div>

      <div className="space-y-1 rounded-xl border border-white/10 bg-slate-950/40 p-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Next step</p>
        <p className="text-sm text-slate-200">{failure.nextStep}</p>
        {failure.userAction?.title ? (
          <p className="text-xs text-slate-400">{failure.userAction.title}</p>
        ) : null}
      </div>

      {failure.diagnostics?.failureReasons?.length ? (
        <Alert intent="warning" title="Diagnostic detail">
          <ul className="space-y-1 text-sm">
            {failure.diagnostics.failureReasons.slice(0, 3).map((reason, index) => (
              <li key={`${failure.code}-reason-${index}`}>{reason}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {onRetry && failure.retryable ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950"
            onClick={onRetry}
          >
            {retryLabel ?? "Retry"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
