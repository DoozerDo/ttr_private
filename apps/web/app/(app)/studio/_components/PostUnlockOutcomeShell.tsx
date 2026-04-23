"use client";

import { FormButton } from "@/components/FormButton";
import type { PostUnlockOutcomeModel } from "@/lib/postUnlockOutcomeModel";
import { formatPostUnlockDeltaSummary } from "@/lib/postUnlockOutcomeModel";

export function PostUnlockOutcomeShell(props: {
  model: PostUnlockOutcomeModel;
  detail?: string | null;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  onDismiss?: () => void;
}) {
  const { model } = props;
  const delta = formatPostUnlockDeltaSummary(model.deltaSummary);

  return (
    <section
      className="rounded-[28px] border border-white/10 bg-slate-900/45 p-6 md:p-8"
      data-testid="studio-post-unlock-shell"
    >
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Re-evaluation result</p>
        <h2 className="text-2xl font-semibold text-white">{model.headline}</h2>
        <p className="text-sm text-slate-200">{model.body}</p>
        {props.detail ? <p className="text-sm text-rose-200">{props.detail}</p> : null}
      </div>

      {delta ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-950/20 p-4 text-sm text-slate-100" data-testid="studio-post-unlock-delta">
          {delta}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <FormButton
          onClick={props.onPrimary}
          disabled={Boolean(props.primaryDisabled)}
          data-testid="studio-post-unlock-primary"
        >
          {model.primaryCta.label}
        </FormButton>
        {model.secondaryCta ? (
          <FormButton
            variant="secondary"
            onClick={props.onSecondary ?? (() => {})}
            data-testid="studio-post-unlock-secondary"
          >
            {model.secondaryCta.label}
          </FormButton>
        ) : null}
        {props.onDismiss && model.secondaryCta?.action !== "dismiss" ? (
          <FormButton variant="ghost" onClick={props.onDismiss} data-testid="studio-post-unlock-dismiss">
            Continue in Studio
          </FormButton>
        ) : null}
      </div>
    </section>
  );
}
