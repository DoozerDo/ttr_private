"use client";

export type ProgressRailStepSchema<Key extends string = string> = {
  key: Key;
  label: string;
  /**
   * Optional label to show while `isProcessing` is true for this step.
   */
  processingLabel?: string;
};

export type ProgressRailProps<Key extends string> = {
  steps: ProgressRailStepSchema<Key>[];
  currentStepKey: Key;
  completedStepKeys: Key[];
  blockedStepKey?: Key;
  isProcessing?: boolean;
  highlightStepKey?: Key;
  heading?: string | null;
  processingStepKeys?: Key[];
};

type ProgressRailStepStatus = "complete" | "current" | "future" | "blocked";

// Resume and Cover Letter section schema example:
// const resumeRailSchema: ProgressRailStepSchema<"documents" | "draft" | "review"> = [
//   { key: "documents", label: "Document upload" },
//   { key: "draft", label: "Draft tailoring" },
//   { key: "review", label: "Final review" },
// ];
//
// Job Tracker schema example:
// const jobTrackerRailSchema: ProgressRailStepSchema<"plan" | "apply" | "followUp"> = [
//   { key: "plan", label: "Plan outreach" },
//   { key: "apply", label: "Submit applications" },
//   { key: "followUp", label: "Track replies" },
// ];
//
// Interview Toolkit schema example:
// const interviewRailSchema: ProgressRailStepSchema<"preparation" | "practice" | "debrief"> = [
//   { key: "preparation", label: "Preparation" },
//   { key: "practice", label: "Practice rounds" },
//   { key: "debrief", label: "Debrief" },
// ];

export function ProgressRail<Key extends string>({
  steps,
  currentStepKey,
  completedStepKeys,
  blockedStepKey,
  isProcessing = false,
  highlightStepKey,
  heading,
  processingStepKeys,
}: ProgressRailProps<Key>) {
  const completedSet = new Set(completedStepKeys);

  return (
    <aside className="progress-rail-shell">
      {heading ? (
        <p className="progress-rail-heading">{heading}</p>
      ) : null}
      <div className="progress-rail-steps">
          {steps.map((step) => {
            const isBlocked = blockedStepKey === step.key;
            const isCurrent = step.key === currentStepKey;
            const status: ProgressRailStepStatus = isBlocked
            ? "blocked"
            : isCurrent
              ? "current"
              : completedSet.has(step.key)
                ? "complete"
                : "future";
              const helperText =
                isBlocked
                  ? "Blocked"
                  : isProcessing && isCurrent
                    ? step.processingLabel ?? "Processing"
                    : undefined;
              const isHighlighted = highlightStepKey === step.key;
              const isProcessingStep = processingStepKeys?.includes(step.key) ?? false;
              const processingIndicator = isProcessingStep || (isProcessing && isCurrent);
              const markerClass = [
                "progress-rail-status-dot",
                status === "current" ? "progress-rail-status-current" : "",
                status === "complete" ? "progress-rail-status-complete" : "",
                status === "blocked" ? "progress-rail-status-blocked" : "",
              ]
                .filter(Boolean)
                .join(" ");

          return (
            <div
              key={step.key}
              className="progress-rail-step-row"
              data-highlighted={isHighlighted ? "true" : "false"}
              data-processing={processingIndicator ? "true" : "false"}
            >
              <div className="progress-rail-step-main">
                <span className={markerClass} />
                <span className="progress-rail-step-label">{step.label}</span>
              </div>
              {helperText ? (
                <span className="progress-rail-helper">{helperText}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .progress-rail-shell {
          border-radius: 1.5rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(15, 23, 42, 0.6);
          padding: 1rem;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }

        .progress-rail-heading {
          margin: 0 0 0.65rem;
          font-size: 0.65rem;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: rgba(148, 163, 184, 0.9);
        }

        .progress-rail-steps {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          color: rgba(226, 232, 240, 0.9);
        }

        .progress-rail-step-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .progress-rail-step-row[data-highlighted="true"] .progress-rail-status-dot {
          box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.45);
        }

        .progress-rail-step-main {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .progress-rail-status-dot {
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          background: transparent;
          transition: background 0.2s ease, border-color 0.2s ease;
        }

        .progress-rail-step-row[data-processing="true"] .progress-rail-status-dot {
          animation: progress-rail-pulse 1.4s ease-out infinite;
          box-shadow: 0 0 0 6px rgba(251, 191, 36, 0.25);
        }

        @keyframes progress-rail-pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          70% {
            transform: scale(1.4);
            opacity: 0;
          }
          100% {
            transform: scale(1.4);
            opacity: 0;
          }
        }

        .progress-rail-status-current {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.6);
        }

        .progress-rail-status-complete {
          background: #fbbf24;
          border-color: #fbbf24;
        }

        .progress-rail-status-blocked {
          background: rgba(251, 191, 36, 0.65);
          border-color: rgba(251, 191, 36, 0.65);
        }

        .progress-rail-step-label {
          font-size: 0.75rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
        }

        .progress-rail-helper {
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.35em;
          color: rgba(148, 163, 184, 0.85);
          white-space: nowrap;
        }
      `}</style>
    </aside>
  );
}
