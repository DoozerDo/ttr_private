"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FormButton } from "@/components/FormButton";
import { GuidedOverlay } from "@/components/GuidedOverlay";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { useGuidedMode } from "@/hooks/useGuidedMode";
import { getPromptsForGap } from "@/lib/gapPromptMapping";

type GapStatus = "NOT_STARTED" | "RESOLVED" | "STILL_WEAK" | "SKIPPED";

type GapDraft = {
  situation: string;
  ownership: string;
  stakeholders: string;
  outcomes: string;
};

type GapSessionState = {
  status: GapStatus;
  draft: GapDraft;
  reason: string;
  responseSnapshot?: unknown;
};

type LatestAnalysis = {
  jobId?: string | null;
  baselineId?: string | null;
  baselineVersionId?: string | null;
  verification_coverage?: {
    unverifiedRequirements?: string[] | null;
  } | null;
};

const STORAGE_PREFIX = "resolve-gaps-session";
const LAST_ASSESSMENT_STORAGE_KEY = "ttr-last-assessment-id";

const emptyDraft = (): GapDraft => ({
  situation: "",
  ownership: "",
  stakeholders: "",
  outcomes: "",
});

const defaultReason = "Not enough verified baseline evidence for this requirement yet.";

function normalizeRequirements(raw: string[] | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0),
    ),
  );
}

function safeGapId(label: string): string {
  return `gap-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function computeResolutionStatus(draft: GapDraft): GapStatus {
  const signalLength =
    draft.situation.trim().length +
    draft.ownership.trim().length +
    draft.stakeholders.trim().length +
    draft.outcomes.trim().length;
  return signalLength >= 160 && /\d/.test(draft.outcomes) ? "RESOLVED" : "STILL_WEAK";
}

export default function ResolveGapsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const jobId = (searchParams.get("jobId") ?? "").trim();
  const baselineId = (searchParams.get("baselineId") ?? "").trim();
  const storageKey = `${STORAGE_PREFIX}:${jobId}:${baselineId}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LatestAnalysis | null>(null);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [gapState, setGapState] = useState<Record<string, GapSessionState>>({});
  const [selectedGap, setSelectedGap] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const { isGuidedActive, advanceStep } = useGuidedMode();
  const reanalysisInFlightRef = useRef(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!jobId || !baselineId) {
        setError("Missing required context. Open Resolve Gaps from Results so job and baseline are provided.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/analysis/job/${encodeURIComponent(jobId)}/baseline/${encodeURIComponent(baselineId)}/latest`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as LatestAnalysis | { error?: string };
        if (!response.ok) {
          throw new Error((payload as { error?: string })?.error || "Unable to load latest analysis.");
        }
        if (cancelled) return;
        const latest = payload as LatestAnalysis;
        const normalized = normalizeRequirements(latest.verification_coverage?.unverifiedRequirements);
        setAnalysis(latest);
        setRequirements(normalized);

        const persistedRaw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
        const persisted = persistedRaw ? (JSON.parse(persistedRaw) as Record<string, GapSessionState>) : {};
        const nextState: Record<string, GapSessionState> = {};
        normalized.forEach((requirement) => {
          nextState[requirement] = persisted?.[requirement] ?? {
            status: "NOT_STARTED",
            reason: defaultReason,
            draft: emptyDraft(),
          };
        });
        setGapState(nextState);

        const firstNotStarted = normalized.find((item) => nextState[item]?.status === "NOT_STARTED");
        setSelectedGap(firstNotStarted ?? normalized[0] ?? null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load gap data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [baselineId, jobId, storageKey]);

  useEffect(() => {
    if (!jobId || !baselineId) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(gapState));
  }, [baselineId, gapState, jobId, storageKey]);
  useEffect(() => {
    if (!isGuidedActive) return;
    advanceStep("RESOLVE_GAPS");
  }, [advanceStep, isGuidedActive]);

  const selectedState = selectedGap ? gapState[selectedGap] : null;
  const selectedPromptSet = useMemo(
    () => getPromptsForGap(selectedGap ?? ""),
    [selectedGap],
  );
  const resolvedCount = useMemo(
    () => requirements.filter((item) => gapState[item]?.status === "RESOLVED").length,
    [gapState, requirements],
  );
  const remainingCount = requirements.length - resolvedCount;
  const allProcessed = useMemo(
    () =>
      requirements.length > 0 &&
      requirements.every((item) => {
        const status = gapState[item]?.status;
        return status && status !== "NOT_STARTED";
      }),
    [gapState, requirements],
  );
  const selectedIndex = selectedGap ? requirements.findIndex((item) => item === selectedGap) : -1;
  const isLastGap = selectedIndex >= 0 && selectedIndex === requirements.length - 1;
  const canShowReanalyzeNow = resolvedCount > 0 || isLastGap || allProcessed;
  const selectedProcessed = selectedState
    ? selectedState.status === "RESOLVED" || selectedState.status === "STILL_WEAK" || selectedState.status === "SKIPPED"
    : false;

  const setDraftField = (field: keyof GapDraft, value: string) => {
    if (!selectedGap) return;
    setGapState((current) => ({
      ...current,
      [selectedGap]: {
        ...(current[selectedGap] ?? { status: "NOT_STARTED", reason: defaultReason, draft: emptyDraft() }),
        draft: {
          ...(current[selectedGap]?.draft ?? emptyDraft()),
          [field]: value,
        },
      },
    }));
  };

  const moveToNextGap = () => {
    if (!requirements.length) return;
    const firstNotStarted = requirements.find((item) => gapState[item]?.status === "NOT_STARTED");
    if (firstNotStarted) {
      setSelectedGap(firstNotStarted);
      return;
    }
    const idx = selectedGap ? requirements.indexOf(selectedGap) : -1;
    const next = idx >= 0 && idx < requirements.length - 1 ? requirements[idx + 1] : requirements[idx] ?? requirements[0];
    setSelectedGap(next);
  };

  const submitCurrentGap = async () => {
    if (!selectedGap || !selectedState) return;
    if (!analysis?.baselineVersionId?.trim()) {
      setError("Baseline version is missing for this analysis. Re-run analysis before resolving gaps.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const draft = selectedState.draft;
      const response = await fetch("/api/interview-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          baselineId,
          baselineVersionId: analysis.baselineVersionId,
          gapList: [
            {
              gapId: safeGapId(selectedGap),
              category: "verification_coverage",
              domain: "role_requirement",
              prompt: selectedGap,
              jdExcerpt: selectedGap,
            },
          ],
          questions: [
            { gapId: safeGapId(selectedGap), category: "context", prompt: "Situation / what changed", jdReference: selectedGap },
            { gapId: safeGapId(selectedGap), category: "ownership", prompt: "Ownership", jdReference: selectedGap },
            { gapId: safeGapId(selectedGap), category: "stakeholders", prompt: "Stakeholders", jdReference: selectedGap },
            { gapId: safeGapId(selectedGap), category: "outcomes", prompt: "Outcomes", jdReference: selectedGap },
          ],
          responses: [
            `Situation: ${draft.situation}`.trim(),
            `Ownership: ${draft.ownership}`.trim(),
            `Stakeholders: ${draft.stakeholders}`.trim(),
            `Outcomes: ${draft.outcomes}`.trim(),
          ],
          validationResults: {
            source: "resolve_gaps",
            requirement: selectedGap,
          },
        }),
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error("Unable to save this gap response.");
      }

      const status = computeResolutionStatus(draft);
      setGapState((current) => ({
        ...current,
        [selectedGap]: {
          ...current[selectedGap],
          status,
          responseSnapshot: payload,
        },
      }));
      setSavedBanner(status === "RESOLVED" ? "Gap marked RESOLVED." : "Gap still needs stronger proof.");
      if (isGuidedActive) {
        advanceStep("REANALYZE");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit gap response.");
    } finally {
      setSubmitting(false);
    }
  };

  const skipCurrentGap = () => {
    if (!selectedGap) return;
    setGapState((current) => ({
      ...current,
      [selectedGap]: {
        ...(current[selectedGap] ?? { reason: defaultReason, draft: emptyDraft() }),
        status: "SKIPPED",
      },
    }));
    moveToNextGap();
  };

  const saveAndExit = () => {
    const query = new URLSearchParams();
    if (jobId) query.set("jobId", jobId);
    if (baselineId) query.set("baselineId", baselineId);
    const next = query.toString() ? `/results?${query.toString()}` : "/results";
    router.push(next);
  };

  const runReanalysis = async () => {
    if (reanalysisInFlightRef.current) return;
    reanalysisInFlightRef.current = true;
    setReanalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, baselineId }),
      });
      const payload = (await response.json()) as { assessmentId?: string; id?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to run reanalysis.");
      }
      const assessmentId = (payload.assessmentId ?? payload.id ?? "").trim();
      if (!assessmentId) {
        throw new Error("Reanalysis completed without an assessment ID.");
      }
      try {
        await fetch("/api/users/me/last-assessment", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastAssessmentId: assessmentId }),
        });
      } catch {
        // non-blocking best effort
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_ASSESSMENT_STORAGE_KEY, assessmentId);
      }
      if (isGuidedActive) {
        advanceStep("GENERATE");
      }
      router.push(`/results?jobId=${encodeURIComponent(jobId)}`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run reanalysis.");
    } finally {
      reanalysisInFlightRef.current = false;
      setReanalyzing(false);
    }
  };

  return (
    <PageShell>
      <div className="space-y-6">
        <PageHeader
          title="Resolve Gaps"
          description="Strengthen role-specific proof before reanalyzing fit."
        />
        {isGuidedActive ? (
          <GuidedOverlay
            headline="Answer this to strengthen your proof."
            body="Complete this gap prompt with concrete ownership, systems, scope, and outcomes."
            ctaLabel="Continue"
            onCtaClick={() => {
              if (selectedProcessed) {
                moveToNextGap();
                return;
              }
              void submitCurrentGap();
            }}
          />
        ) : null}

        {loading ? <p className="text-sm text-slate-300">Loading role-scoped gaps…</p> : null}
        {error ? <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
        {savedBanner ? <p className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{savedBanner}</p> : null}

        {!loading && !error ? (
          <div className="grid gap-4 lg:grid-cols-[1.05fr_1.6fr_1fr]">
            <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <h2 className="text-base font-semibold text-slate-100">Gap Queue</h2>
              <ul className="mt-3 space-y-2">
                {requirements.map((requirement) => {
                  const state = gapState[requirement];
                  const isSelected = selectedGap === requirement;
                  return (
                    <li key={requirement}>
                      <button
                        type="button"
                        onClick={() => setSelectedGap(requirement)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                          isSelected
                            ? "border-sky-300/70 bg-sky-500/15"
                            : "border-white/10 bg-slate-950/25 hover:border-white/20"
                        }`}
                      >
                        <p className="text-sm font-medium text-slate-100">{requirement}</p>
                        <p className="mt-1 text-xs text-slate-300">{state?.reason ?? defaultReason}</p>
                        <p className="mt-1 text-[11px] tracking-wide text-slate-400">{state?.status ?? "NOT_STARTED"}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <h2 className="text-base font-semibold text-slate-100">Guided Panel</h2>
              {selectedGap && selectedState ? (
                <div className="mt-3 space-y-4">
                  <div className="rounded-lg border border-white/10 bg-slate-950/25 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Requirement Context</p>
                    <p className="mt-1 text-sm text-slate-100">This role expects: {selectedGap}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/25 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Weakness Explanation</p>
                    <p className="mt-1 text-sm text-slate-100">Your baseline does not show enough evidence of this area.</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950/25 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">What Helps</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-100">
                      <li>ownership</li>
                      <li>systems</li>
                      <li>scope</li>
                      <li>measurable outcomes</li>
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm text-slate-200">
                      {selectedPromptSet.prompts[0]}
                      <textarea
                        className="mt-1 w-full rounded-md border border-white/15 bg-slate-950/60 p-2 text-sm text-slate-100"
                        rows={3}
                        value={selectedState.draft.situation}
                        onChange={(event) => setDraftField("situation", event.target.value)}
                      />
                    </label>
                    <label className="block text-sm text-slate-200">
                      {selectedPromptSet.prompts[1]}
                      <textarea
                        className="mt-1 w-full rounded-md border border-white/15 bg-slate-950/60 p-2 text-sm text-slate-100"
                        rows={3}
                        value={selectedState.draft.ownership}
                        onChange={(event) => setDraftField("ownership", event.target.value)}
                      />
                    </label>
                    <label className="block text-sm text-slate-200">
                      {selectedPromptSet.prompts[2]}
                      <textarea
                        className="mt-1 w-full rounded-md border border-white/15 bg-slate-950/60 p-2 text-sm text-slate-100"
                        rows={3}
                        value={selectedState.draft.stakeholders}
                        onChange={(event) => setDraftField("stakeholders", event.target.value)}
                      />
                    </label>
                    <label className="block text-sm text-slate-200">
                      {selectedPromptSet.prompts[3]}
                      <textarea
                        className="mt-1 w-full rounded-md border border-white/15 bg-slate-950/60 p-2 text-sm text-slate-100"
                        rows={3}
                        value={selectedState.draft.outcomes}
                        onChange={(event) => setDraftField("outcomes", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-300">No unresolved gaps found for this role.</p>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <h2 className="text-base font-semibold text-slate-100">Progress Panel</h2>
              <div className="mt-3 space-y-2 text-sm text-slate-100">
                <p>Total gaps: {requirements.length}</p>
                <p>Resolved gaps: {resolvedCount}</p>
                <p>Remaining gaps: {remainingCount}</p>
              </div>
              <p className="mt-3 text-sm text-slate-300">Reanalyze after strengthening key gaps.</p>

              {allProcessed ? (
                <div className="mt-4 rounded-lg border border-emerald-300/35 bg-emerald-500/10 p-3">
                  <p className="text-sm font-medium text-emerald-100">
                    You’ve strengthened the missing proof for this role.
                  </p>
                  <div className="mt-3">
                    <FormButton onClick={() => void runReanalysis()} disabled={submitting || reanalyzing}>
                      {reanalyzing ? "Reanalyzing..." : "Reanalyze Role"}
                    </FormButton>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {!loading && !error && !allProcessed ? (
          <div className="flex flex-wrap gap-2">
            <FormButton
              onClick={() => {
                if (selectedProcessed) {
                  moveToNextGap();
                  return;
                }
                void submitCurrentGap();
              }}
              disabled={submitting || !selectedGap}
            >
              {selectedProcessed ? "Continue to next gap" : "Continue"}
            </FormButton>
            <FormButton variant="secondary" onClick={saveAndExit} disabled={submitting}>
              Save and exit
            </FormButton>
            <FormButton variant="ghost" onClick={skipCurrentGap} disabled={submitting || !selectedGap}>
              Skip this gap
            </FormButton>
            {canShowReanalyzeNow ? (
              <FormButton variant="secondary" onClick={() => void runReanalysis()} disabled={submitting || reanalyzing}>
                {reanalyzing ? "Reanalyzing..." : "Reanalyze now"}
              </FormButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
