"use client";

import { useEffect, useMemo, useState } from "react";
import { FormButton } from "@/components/FormButton";

type UserEngagementState = {
  userId: string;
  email: string;
  lastActiveAt: string | null;
  mostRecentScore: number | null;
  stateFlags: Record<string, boolean>;
};

type UserTrigger = {
  id: string;
  userId: string;
  triggerType: string;
  priority: "low" | "medium" | "high";
  reason: string;
  createdAt: string;
};

type OutreachDraft = {
  subject: string;
  message: string;
};

function activeFlags(flags: Record<string, boolean>): string[] {
  return Object.entries(flags)
    .filter(([, value]) => value)
    .map(([key]) => key);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function UserEngagementPage() {
  const [states, setStates] = useState<UserEngagementState[]>([]);
  const [triggers, setTriggers] = useState<UserTrigger[]>([]);
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const latestTriggerByUser = useMemo(() => {
    const map = new Map<string, UserTrigger>();
    for (const trigger of triggers) {
      const current = map.get(trigger.userId);
      if (!current || new Date(trigger.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        map.set(trigger.userId, trigger);
      }
    }
    return map;
  }, [triggers]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statesRes, triggersRes] = await Promise.all([
          fetch("/api/admin/user-engagement-states", { cache: "no-store" }),
          fetch("/api/admin/user-triggers", { cache: "no-store" }),
        ]);
        if (!statesRes.ok) throw new Error("Unable to load user engagement states.");
        if (!triggersRes.ok) throw new Error("Unable to load user triggers.");
        const [statePayload, triggerPayload] = await Promise.all([statesRes.json(), triggersRes.json()]);
        if (!cancelled) {
          setStates(Array.isArray(statePayload) ? statePayload : []);
          setTriggers(Array.isArray(triggerPayload) ? triggerPayload : []);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const runTriggerEvaluation = async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/run-trigger-evaluation", { method: "POST" });
      if (!response.ok) throw new Error("Unable to run trigger evaluation.");
      const payload = (await response.json()) as UserTrigger[];
      setTriggers((current) => [...(Array.isArray(payload) ? payload : []), ...current]);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run trigger evaluation.");
    }
  };

  const generateDraft = async (userId: string, triggerType: string) => {
    setError(null);
    try {
      const response = await fetch("/api/admin/generate-outreach-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, triggerType }),
      });
      if (!response.ok) throw new Error("Unable to generate outreach draft.");
      const payload = (await response.json()) as OutreachDraft;
      setDraft(payload);
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Unable to generate outreach draft.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">Founder Ops</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">User Engagement Dashboard</h1>
        <p className="text-sm text-slate-300">
          Deterministic user states, trigger suggestions, and copy-ready follow-up drafts.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <FormButton onClick={() => void runTriggerEvaluation()}>Run Trigger Evaluation</FormButton>
      </div>

      {loading ? <p className="text-sm text-slate-300">Loading user engagement…</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="px-2 py-2">User</th>
                <th className="px-2 py-2">State Flags</th>
                <th className="px-2 py-2">Last Active</th>
                <th className="px-2 py-2">Score</th>
                <th className="px-2 py-2">Trigger</th>
                <th className="px-2 py-2">Priority</th>
                <th className="px-2 py-2">Draft</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {states.map((state) => {
                const trigger = latestTriggerByUser.get(state.userId) ?? null;
                return (
                  <tr key={state.userId}>
                    <td className="px-2 py-2 text-slate-100">{state.email}</td>
                    <td className="px-2 py-2 text-slate-200">{activeFlags(state.stateFlags).join(", ") || "-"}</td>
                    <td className="px-2 py-2 text-slate-200">{formatDate(state.lastActiveAt)}</td>
                    <td className="px-2 py-2 text-slate-200">
                      {typeof state.mostRecentScore === "number" ? Math.round(state.mostRecentScore) : "-"}
                    </td>
                    <td className="px-2 py-2 text-slate-100">{trigger?.triggerType ?? "-"}</td>
                    <td className="px-2 py-2 text-slate-200">{trigger?.priority ?? "-"}</td>
                    <td className="px-2 py-2">
                      {trigger ? (
                        <FormButton
                          variant="ghost"
                          onClick={() => void generateDraft(state.userId, trigger.triggerType)}
                        >
                          Generate Draft
                        </FormButton>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {draft ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Outreach draft</p>
          <p className="mt-2 text-base font-semibold text-slate-100">{draft.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{draft.message}</p>
          <div className="mt-3">
            <FormButton
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.message}`);
              }}
            >
              Copy Draft
            </FormButton>
          </div>
        </section>
      ) : null}
    </div>
  );
}

