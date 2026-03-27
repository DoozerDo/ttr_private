"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { readLastAnalysis } from "@/app/(app)/lib/session";
import { derivePrimaryNextAction, getGenerationCompletionStorageKey } from "@/lib/nextAction";

const resolvedGitSha =
  process.env.NEXT_PUBLIC_GIT_SHA ??
  process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  "";

type ReportBugModalProps = {
  open: boolean;
  onClose: () => void;
  userId?: string;
};

type BugReportCreateResponse = {
  ok: boolean;
  reportId: string;
};

type StructuredBugContext = {
  baselineId: string | null;
  jobId: string | null;
  assessmentId: string | null;
  score: number | null;
  nextAction: string | null;
};

export function ReportBugModal({ open, onClose, userId }: ReportBugModalProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [whatHappened, setWhatHappened] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);

  const structuredContext = useMemo<StructuredBugContext>(() => {
    const stored = readLastAnalysis();
    const routeBaselineId = searchParams?.get("baselineId")?.trim() || null;
    const routeJobId = searchParams?.get("jobId")?.trim() || null;
    const routeAssessmentId =
      searchParams?.get("assessmentId")?.trim() || searchParams?.get("analysisId")?.trim() || null;

    const baselineId = routeBaselineId || stored?.baselineId || stored?.analysis?.baselineId || null;
    const jobId = routeJobId || stored?.jobId || stored?.analysis?.jobId || null;
    const assessmentId =
      routeAssessmentId ||
      (typeof stored?.analysis?.assessmentId === "string" ? stored.analysis.assessmentId : null) ||
      null;
    const score =
      typeof stored?.fitScore === "number"
        ? stored.fitScore
        : typeof stored?.analysis?.score === "number"
          ? stored.analysis.score
          : typeof stored?.analysis?.fit_score === "number"
            ? stored.analysis.fit_score
            : typeof stored?.analysis?.overallScore === "number"
              ? stored.analysis.overallScore
              : typeof stored?.analysis?.overall_score === "number"
                ? stored.analysis.overall_score
                : null;
    const hasCompletedGeneration =
      typeof window !== "undefined" && Boolean(getGenerationCompletionStorageKey(jobId, baselineId))
        ? Boolean(window.localStorage.getItem(getGenerationCompletionStorageKey(jobId, baselineId) as string))
        : false;
    const opportunityAlreadySaved = Boolean(
      stored?.analysis?.opportunityId ||
        stored?.analysis?.opportunityAlreadySaved ||
        stored?.analysis?.savedOpportunityId,
    );
    const nextAction = derivePrimaryNextAction({
      analysisPresent: Boolean(stored || assessmentId || baselineId || jobId),
      fitScore: score,
      hasCompletedGeneration,
      opportunityAlreadySaved,
      jobId,
      baselineId,
    }).action;

    return {
      baselineId,
      jobId,
      assessmentId,
      score,
      nextAction,
    };
  }, [searchParams]);

  useEffect(() => {
    if (!open) return;
    setWhatHappened("");
    setDetails("");
    setStatus("idle");
    setStatusMessage(null);
    setCreatedReportId(null);
  }, [open]);

  const isValid = whatHappened.trim().length >= 10;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isValid || status === "loading") return;

      setStatus("loading");
      setStatusMessage(null);

      const runtimeContext = {
        timestamp: new Date().toISOString(),
        route: `${window.location.pathname}${window.location.search}`,
        pageLabel: document.title || undefined,
        userId,
        lastUserAction: window.sessionStorage.getItem("ttr:last-user-action") ?? undefined,
      };

      const requestPayload = {
        description: whatHappened.trim(),
        details: details.trim() || undefined,
        route: `${window.location.pathname}${window.location.search}`,
        timestamp: runtimeContext.timestamp,
        userId: userId ?? null,
        baselineId: structuredContext.baselineId,
        jobId: structuredContext.jobId,
        assessmentId: structuredContext.assessmentId,
        score: structuredContext.score,
        nextAction: structuredContext.nextAction,
        runtimeContext,
      };

      try {
        const response = await fetch("/api/support/report-bug", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(errorPayload?.message ?? "Bug report failed to send. Please try again.");
        }

        const responsePayload = (await response.json()) as BugReportCreateResponse;
        setStatus("success");
        setStatusMessage("Thanks. Your report was submitted successfully.");
        setCreatedReportId(responsePayload.reportId);
        setWhatHappened("");
        setDetails("");
      } catch (err) {
        setStatus("error");
        setStatusMessage(err instanceof Error ? err.message : "Bug report failed to send. Please try again.");
      }
    },
    [details, isValid, pathname, status, structuredContext, userId, whatHappened],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Report a bug"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="w-full max-w-2xl space-y-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Report Issue</h2>
            <p className="text-sm text-slate-400">Short description first. Context is attached automatically.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/40"
          >
            Close
          </button>
        </div>

        <div className="space-y-1 text-sm">
          <label className="block text-slate-200">What happened?</label>
          <textarea
            value={whatHappened}
            onChange={(event) => setWhatHappened(event.target.value)}
            required
            minLength={10}
            maxLength={4000}
            className="h-32 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/70"
            placeholder="What went wrong?"
          />
        </div>

        <div className="space-y-1 text-sm">
          <label className="block text-slate-200">Additional details (optional)</label>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={4000}
            className="h-28 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/70"
            placeholder="Steps, expected result, what you saw"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!isValid || status === "loading"}
            className="flex-1 rounded-2xl border border-amber-400/60 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/90 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Sending..." : "Send issue report"}
          </button>
          <span
            className={`text-xs ${status === "success" ? "text-emerald-300" : status === "error" ? "text-rose-300" : "text-slate-400"}`}
            role="status"
            aria-live="polite"
          >
            {statusMessage ??
              (isValid ? (createdReportId ? `Report ID: ${createdReportId}` : "Ready to send.") : "Please enter at least 10 characters.")}
          </span>
        </div>
      </form>
    </div>
  );
}
