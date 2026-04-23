"use client";

import { useMemo, useState } from "react";

import { FormButton } from "@/components/FormButton";

type UnlockEvidenceAnswer = {
  requirement: string;
  answer: string;
};

export type UnlockPanelProps = {
  dimension: string;
  missingEvidence: string[];
  submitting: boolean;
  error: string | null;
  onSkip: () => void;
  onSubmit: (payload: { dimension: string; answers: UnlockEvidenceAnswer[] }) => void | Promise<void>;
};

function promptForMissingEvidence(requirement: string): string {
  const lowered = requirement.toLowerCase();
  if (/\bzendesk\b/.test(lowered)) {
    return "Describe a time you used Zendesk to improve response time, CSAT, or escalation handling. Include what you did and what changed.";
  }
  if (/\bservice cloud\b/.test(lowered) || /\bsalesforce\b/.test(lowered)) {
    return "Describe a time you used Salesforce Service Cloud to improve a workflow, routing, reporting, or customer outcomes. Include what you did and what changed.";
  }
  if (/\bservice\s?now\b/.test(lowered) || /\bservicenow\b/.test(lowered)) {
    return "Describe a time you used ServiceNow to improve incident or request handling. Include what you did and what changed.";
  }
  if (/\bjira\b/.test(lowered)) {
    return "Describe a time you used Jira to manage cross-functional work. Include what you did and what changed.";
  }
  return `Add a specific, real example demonstrating: ${requirement}. Include context, what you did, and the outcome.`;
}

export function UnlockPanel({
  dimension,
  missingEvidence,
  submitting,
  error,
  onSkip,
  onSubmit,
}: UnlockPanelProps) {
  const evidence = useMemo(() => missingEvidence.filter(Boolean), [missingEvidence]);
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({}));
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleChange = (requirement: string, value: string) => {
    setFieldError(null);
    setAnswers((current) => ({ ...current, [requirement]: value }));
  };

  const handleSubmit = async () => {
    setFieldError(null);
    const payload: UnlockEvidenceAnswer[] = evidence.map((requirement) => ({
      requirement,
      answer: String(answers[requirement] ?? "").trim(),
    }));

    const missing = payload.filter((item) => !item.answer);
    if (missing.length) {
      setFieldError("Add at least one concrete detail for each missing evidence item.");
      return;
    }

    await onSubmit({ dimension, answers: payload });
  };

  return (
    <section
      className="rounded-[28px] border border-white/10 bg-slate-900/45 p-6 md:p-8"
      data-testid="studio-unlock-panel"
    >
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.32em] text-amber-200/90">Unlock flow</p>
        <h2 className="text-2xl font-semibold text-white">Complete this to unlock your documents</h2>
        <p className="text-sm text-slate-200">This is the missing experience preventing generation.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-slate-100">
        <p className="text-xs uppercase tracking-[0.3em] text-amber-200/90">Fastest path</p>
        <p className="mt-1 text-sm text-slate-100">
          Dimension: <span className="font-semibold text-white">{dimension}</span>
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-sm font-semibold text-slate-100">You haven't demonstrated:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-200" data-testid="studio-unlock-missing-evidence">
          {evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="mt-6 space-y-4" data-testid="studio-unlock-inputs">
        {evidence.map((requirement, index) => (
          <div key={requirement} className="rounded-2xl border border-white/10 bg-slate-950/20 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{`Missing evidence ${index + 1}`}</p>
            <p className="mt-2 text-sm font-semibold text-slate-100">{requirement}</p>
            <p className="mt-1 text-sm text-slate-300">{promptForMissingEvidence(requirement)}</p>
            <textarea
              className="mt-3 min-h-[110px] w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-7 text-slate-100 outline-none transition focus:border-sky-300/40"
              value={answers[requirement] ?? ""}
              onChange={(event) => handleChange(requirement, event.target.value)}
              placeholder="Add a real example from your experience..."
              data-testid={`studio-unlock-input-${index}`}
              disabled={submitting}
            />
          </div>
        ))}
      </div>

      {fieldError ? <p className="mt-4 text-sm text-rose-200">{fieldError}</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-200">{error}</p> : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <FormButton onClick={handleSubmit} disabled={submitting} data-testid="studio-unlock-cta">
          {submitting ? "Saving..." : "Save and re-evaluate"}
        </FormButton>
        <FormButton variant="ghost" onClick={onSkip} disabled={submitting} data-testid="studio-unlock-skip">
          Skip for now
        </FormButton>
      </div>
    </section>
  );
}
