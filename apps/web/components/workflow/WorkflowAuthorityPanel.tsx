"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { FormButton } from "@/components/FormButton";
import type {
  WorkflowSurfaceAuthorityModel,
  WorkflowSurfaceTrustTone,
} from "@/lib/workflowSurfaceAuthorityModel";

type WorkflowAuthorityPanelAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
  variant?: "primary" | "secondary";
};

const VARIANT_CLASSES: Record<NonNullable<WorkflowAuthorityPanelAction["variant"]>, string> = {
  primary:
    "border-0 bg-[var(--accent-primary)] text-[var(--verdict-apply-text)] hover:bg-[var(--accent-primary-hover)]",
  secondary:
    "border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
};

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-[var(--button-radius)] px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

function WorkflowAuthorityAction({ action, fallbackTestId }: { action: WorkflowAuthorityPanelAction; fallbackTestId: string }) {
  const variant = action.variant ?? "primary";
  const intentClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.primary;
  const disabledClass = action.disabled ? "cursor-not-allowed opacity-60" : "";
  const className = `${BASE_CLASSES} ${intentClass} ${disabledClass} w-full sm:w-auto`;
  const testId = action.testId ?? fallbackTestId;

  if (action.href) {
    if (action.disabled) {
      return (
        <span className={className} data-testid={testId}>
          {action.label}
        </span>
      );
    }
    return (
      <Link href={action.href} onClick={action.onClick} className={className} data-testid={testId}>
        {action.label}
      </Link>
    );
  }

  return (
    <FormButton
      variant={variant}
      onClick={action.onClick}
      disabled={Boolean(action.disabled)}
      className="w-full sm:w-auto"
      data-testid={testId}
    >
      {action.label}
    </FormButton>
  );
}

function defaultEyebrow(state: WorkflowSurfaceAuthorityModel["canonicalState"]): string {
  switch (state) {
    case "hard_blocked":
      return "Blocked";
    case "unlock_required":
      return "Action required";
    case "post_unlock_outcome":
      return "Re-evaluation";
    case "generation_ready":
      return "Ready";
    case "generation_in_progress":
      return "Generating";
    case "documents_ready":
      return "Documents";
    case "partial_documents":
      return "Incomplete";
    case "generation_failed":
      return "Failure";
    default:
      return "Status";
  }
}

function toneClasses(tone: WorkflowSurfaceTrustTone): {
  container: string;
  eyebrow: string;
  headline: string;
  body: string;
} {
  switch (tone) {
    case "complete":
      return {
        container: "border-emerald-300/30 bg-emerald-500/10",
        eyebrow: "text-emerald-100",
        headline: "text-emerald-50",
        body: "text-emerald-50/90",
      };
    case "ready":
      return {
        container: "border-sky-300/30 bg-sky-500/10",
        eyebrow: "text-sky-100",
        headline: "text-slate-50",
        body: "text-slate-100",
      };
    case "in_progress":
      return {
        container: "border-amber-300/30 bg-amber-500/10",
        eyebrow: "text-amber-100",
        headline: "text-slate-50",
        body: "text-slate-100",
      };
    case "failure":
      return {
        container: "border-rose-300/20 bg-rose-500/10",
        eyebrow: "text-rose-100",
        headline: "text-slate-50",
        body: "text-slate-100",
      };
    case "blocked":
      return {
        container: "border-rose-300/20 bg-rose-500/10",
        eyebrow: "text-rose-100",
        headline: "text-slate-50",
        body: "text-slate-100",
      };
    case "recovery":
    default:
      return {
        container: "border-amber-300/30 bg-amber-500/10",
        eyebrow: "text-amber-100",
        headline: "text-slate-50",
        body: "text-slate-100",
      };
  }
}

export function WorkflowAuthorityPanel(props: {
  testId: string;
  model: Pick<
    WorkflowSurfaceAuthorityModel,
    "canonicalState" | "headline" | "body" | "trustTone"
  >;
  eyebrow?: string;
  primaryAction?: WorkflowAuthorityPanelAction | null;
  secondaryAction?: WorkflowAuthorityPanelAction | null;
  supporting?: ReactNode;
  afterActions?: ReactNode;
}) {
  const eyebrow = props.eyebrow ?? defaultEyebrow(props.model.canonicalState);
  const classes = toneClasses(props.model.trustTone);

  if (process.env.NODE_ENV !== "production") {
    console.log("[WORKFLOW][AUTHORITY_RENDER]", {
      canonicalState: props.model.canonicalState,
      headline: props.model.headline,
    });
  }

  return (
    <section
      className={`rounded-[28px] border p-6 md:p-8 ${classes.container}`}
      data-testid={props.testId}
      data-workflow-shell="authority-panel"
      data-workflow-state={props.model.canonicalState}
      data-workflow-trust-tone={props.model.trustTone}
    >
      <div className="space-y-2">
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.32em] ${classes.eyebrow}`}
          data-testid="workflow-authority-eyebrow"
        >
          {eyebrow}
        </p>
        <h2
          className={`text-2xl font-semibold tracking-tight ${classes.headline} md:text-[28px]`}
          data-testid="workflow-authority-headline"
        >
          {props.model.headline}
        </h2>
        <p
          className={`max-w-3xl text-sm leading-6 ${classes.body}`}
          data-testid="workflow-authority-body"
        >
          {props.model.body}
        </p>
        {props.supporting ? (
          <div className="pt-2" data-testid="workflow-authority-supporting">
            {props.supporting}
          </div>
        ) : null}
      </div>

      {props.primaryAction || props.secondaryAction ? (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {props.primaryAction ? (
            <WorkflowAuthorityAction action={props.primaryAction} fallbackTestId="workflow-authority-primary" />
          ) : null}
          {props.secondaryAction ? (
            <WorkflowAuthorityAction
              action={{ ...props.secondaryAction, variant: props.secondaryAction.variant ?? "secondary" }}
              fallbackTestId="workflow-authority-secondary"
            />
          ) : null}
        </div>
      ) : null}

      {props.afterActions ? (
        <div className="mt-6" data-testid="workflow-authority-after-actions">
          {props.afterActions}
        </div>
      ) : null}
    </section>
  );
}
