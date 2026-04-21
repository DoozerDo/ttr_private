"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { readLastAnalysis } from "@/app/(app)/lib/session";
import { getCanonicalNextAction, getGenerationCompletionStorageKey } from "@/lib/nextAction";

const BUG_REPORT_DRAFT_STORAGE_KEY = "ttr.support.bug-report.draft.v1";
const DEFAULT_DISABLED_MESSAGE =
  "Bug reporting is disabled in this environment. Save a draft and check Support history later.";
const DEFAULT_SERVICE_UNAVAILABLE_MESSAGE =
  "Bug reporting service is unavailable right now. Your draft is saved locally.";
const DEFAULT_RETRYABLE_MESSAGE = "Bug report failed to send. Your draft was preserved.";
const DEFAULT_VALIDATION_MESSAGE = "Please enter a message between 10 and 4000 characters.";

type ReportBugModalProps = {
  open: boolean;
  onClose: () => void;
  userId?: string;
};

type BugReportCreateResponse = {
  status: "submission_success";
  message: string;
  reportId: string;
  storedReportId?: string | null;
  deliveredToGithub?: boolean;
  issueNumber?: number | null;
  issueUrl?: string | null;
  sentryEventId?: string | null;
};

type BugReportFailureResponse = {
  status?:
    | "service_unavailable"
    | "configuration_missing"
    | "validation_failed"
    | "submission_failed";
  code?: string;
  message?: string;
  supportPath?: string;
};

type SupportConfigResponse = {
  bugReportingAvailable?: boolean;
  githubConfigured?: boolean;
  storageConfigured?: boolean;
  sentryConfigured?: boolean;
  projectAssignmentEnabled?: boolean;
};

type StructuredBugContext = {
  baselineId: string | null;
  jobId: string | null;
  assessmentId: string | null;
  score: number | null;
  nextAction: string | null;
};

type AvailabilityState =
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "disabled"; message: string; supportPath: string }
  | { kind: "service_unavailable"; message: string; supportPath: string };

type SubmitState =
  | "idle"
  | "submitting"
  | "success"
  | "validation_error"
  | "retryable_error"
  | "service_unavailable"
  | "disabled";

export function ReportBugModal({ open, onClose, userId }: ReportBugModalProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [whatHappened, setWhatHappened] = useState("");
  const [details, setDetails] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [supportFallbackPath, setSupportFallbackPath] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: "checking" });

  const structuredContext = useMemo<StructuredBugContext>(() => {
    const stored = readLastAnalysis();
    const storedAnalysisWithScoringV2 = stored?.analysis as
      | { scoring_v2?: { score?: unknown } | null }
      | undefined;
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
      typeof storedAnalysisWithScoringV2?.scoring_v2?.score === "number"
        ? storedAnalysisWithScoringV2.scoring_v2.score
        : typeof stored?.fitScore === "number"
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
    const nextAction = getCanonicalNextAction({
      fitScore: score,
      generationReady: hasCompletedGeneration,
      trustGateAllowed: !opportunityAlreadySaved,
      opportunityAlreadySaved,
    }).type;

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

    let active = true;
    setSubmitState("idle");
    setStatusMessage(null);
    setCreatedReportId(null);
    setHasSubmitted(false);
    setSupportFallbackPath(null);
    setAvailability({ kind: "checking" });

    if (typeof window === "undefined") {
      setWhatHappened("");
      setDetails("");
      return () => {
        active = false;
      };
    }

    try {
      const raw = window.localStorage.getItem(BUG_REPORT_DRAFT_STORAGE_KEY);
      if (!raw) {
        setWhatHappened("");
        setDetails("");
      } else {
        const draft = JSON.parse(raw) as { whatHappened?: string; details?: string };
        setWhatHappened(draft.whatHappened ?? "");
        setDetails(draft.details ?? "");
      }
    } catch {
      setWhatHappened("");
      setDetails("");
    }

    const loadSupportConfig = async () => {
      try {
        const response = await fetch("/api/support/config", {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const payload = (await response.json().catch(() => null)) as SupportConfigResponse | BugReportFailureResponse | null;

        if (!active) return;

        if (!response.ok) {
          const message =
            payload && "message" in payload
              ? payload.message ?? "Support service is unavailable right now. You can try again later."
              : "Support service is unavailable right now. You can try again later.";
          setAvailability({
            kind: "service_unavailable",
            message,
            supportPath:
              payload && "supportPath" in payload ? payload.supportPath ?? "/support/history" : "/support/history",
          });
          return;
        }

        const bugReportingAvailable =
          payload && "bugReportingAvailable" in payload
            ? payload.bugReportingAvailable !== false
            : payload && "githubConfigured" in payload
              ? payload.githubConfigured !== false
              : true;

        if (!bugReportingAvailable) {
          setAvailability({
            kind: "disabled",
            message: DEFAULT_DISABLED_MESSAGE,
            supportPath: "/support/history",
          });
          return;
        }

        setAvailability({ kind: "ready" });
      } catch {
        if (!active) return;
        setAvailability({
          kind: "service_unavailable",
          message: DEFAULT_SERVICE_UNAVAILABLE_MESSAGE,
          supportPath: "/support/history",
        });
      }
    };

    void loadSupportConfig();

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        BUG_REPORT_DRAFT_STORAGE_KEY,
        JSON.stringify({
          whatHappened,
          details,
          pathname,
        }),
      );
    } catch {
      // Draft persistence is best effort only.
    }
  }, [details, open, pathname, whatHappened]);

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(BUG_REPORT_DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const trimmedMessage = whatHappened.trim();
  const messageLength = trimmedMessage.length;
  const messageIsValid = messageLength >= 10 && messageLength <= 4000;
  const showMessageError = hasSubmitted && !messageIsValid;
  const actionDisabled = submitState === "submitting" || availability.kind !== "ready";
  const availabilityMessage =
    availability.kind === "checking"
      ? "Checking bug reporting availability..."
      : availability.kind === "ready"
        ? null
        : availability.message;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setHasSubmitted(true);
      setSupportFallbackPath(null);

      if (!messageIsValid) {
        setSubmitState("validation_error");
        setStatusMessage(DEFAULT_VALIDATION_MESSAGE);
        return;
      }

      if (availability.kind !== "ready") {
        if (availability.kind === "checking") {
          setSubmitState("service_unavailable");
          setStatusMessage(DEFAULT_SERVICE_UNAVAILABLE_MESSAGE);
          setSupportFallbackPath("/support/history");
          return;
        }
        setSubmitState(availability.kind === "disabled" ? "disabled" : "service_unavailable");
        setStatusMessage(availability.message);
        setSupportFallbackPath(availability.supportPath);
        return;
      }

      if (submitState === "submitting") return;

      setSubmitState("submitting");
      setStatusMessage(null);

      const timestamp = new Date().toISOString();
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

      const requestPayload = {
        message: trimmedMessage,
        details: details.trim() || undefined,
        route: `${window.location.pathname}${window.location.search}`,
        timestamp,
        userId: userId ?? null,
        baselineId: structuredContext.baselineId,
        jobId: structuredContext.jobId,
        assessmentId: structuredContext.assessmentId,
        score: structuredContext.score,
        nextAction: structuredContext.nextAction,
        userAgent,
      };

      try {
        const response = await fetch("/api/support/report-bug", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        });
        const payload = (await response.json().catch(() => null)) as BugReportCreateResponse | BugReportFailureResponse | null;

        const isSubmissionSuccess =
          Boolean(response.ok) &&
          Boolean(payload && "status" in payload && payload.status === "submission_success");

        if (isSubmissionSuccess) {
          setSubmitState("success");
          setStatusMessage(
            payload && "message" in payload && payload.message
              ? payload.message
              : "Thanks. Your report was submitted successfully.",
          );
          setCreatedReportId(payload && "reportId" in payload ? payload.reportId : null);
          setWhatHappened("");
          setDetails("");
          setHasSubmitted(false);
          setSupportFallbackPath(null);
          clearDraft();
          return;
        }

        const supportPath =
          payload && "supportPath" in payload ? payload.supportPath ?? "/support/history" : "/support/history";
        const message =
          (payload && "message" in payload ? payload.message : undefined) ??
          (response.status === 503
            ? DEFAULT_SERVICE_UNAVAILABLE_MESSAGE
            : DEFAULT_RETRYABLE_MESSAGE);

        if (response.status === 400 || payload?.status === "validation_failed") {
          setSubmitState("validation_error");
          setStatusMessage(message || DEFAULT_VALIDATION_MESSAGE);
          setSupportFallbackPath(null);
          return;
        }

        if (
          response.status === 503 &&
          (payload?.status === "configuration_missing" ||
            (payload && "code" in payload ? payload.code : undefined) === "support_config_unavailable")
        ) {
          setSubmitState("disabled");
          setStatusMessage(message || DEFAULT_DISABLED_MESSAGE);
          setSupportFallbackPath(supportPath);
          return;
        }

        if (
          response.status === 503 ||
          payload?.status === "service_unavailable" ||
          (payload && "code" in payload ? payload.code : undefined) === "service_unavailable"
        ) {
          setSubmitState("service_unavailable");
          setStatusMessage(message || DEFAULT_SERVICE_UNAVAILABLE_MESSAGE);
          setSupportFallbackPath(supportPath);
          return;
        }

        setSubmitState("retryable_error");
        setStatusMessage(message || DEFAULT_RETRYABLE_MESSAGE);
        setSupportFallbackPath(supportPath);
      } catch {
        setSubmitState("service_unavailable");
        setStatusMessage(DEFAULT_SERVICE_UNAVAILABLE_MESSAGE);
        setSupportFallbackPath("/support/history");
      }
    },
    [
      availability.kind,
      clearDraft,
      details,
      messageIsValid,
      submitState,
      structuredContext,
      trimmedMessage,
      userId,
    ],
  );

  if (!open) return null;

  const statusText =
    submitState === "submitting"
      ? "Sending issue report..."
      : submitState === "success"
      ? statusMessage ?? (createdReportId ? `Report ID: ${createdReportId}` : "Thanks. Your report was submitted successfully.")
      : statusMessage ??
        (availability.kind === "checking"
          ? "Checking bug reporting availability..."
          : availability.kind === "ready"
            ? messageIsValid
              ? "Ready to send."
              : hasSubmitted
                ? DEFAULT_VALIDATION_MESSAGE
                : "Message must be 10 to 4000 characters."
            : availability.message);

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
          {showMessageError ? (
            <p className="text-xs text-rose-300">{DEFAULT_VALIDATION_MESSAGE}</p>
          ) : null}
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
            disabled={actionDisabled}
            className="flex-1 rounded-2xl border border-amber-400/60 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/90 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitState === "submitting" ? "Sending..." : "Send issue report"}
          </button>
          <span
            className={`text-xs ${submitState === "success" ? "text-emerald-300" : submitState === "validation_error" ? "text-amber-200" : submitState === "retryable_error" || submitState === "service_unavailable" || submitState === "disabled" ? "text-rose-300" : "text-slate-400"}`}
            role="status"
            aria-live="polite"
          >
            {statusText}
          </span>
        </div>

        {availabilityMessage ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <p>{availabilityMessage}</p>
            {availability.kind !== "ready" && availability.kind !== "checking" ? (
              <p className="mt-2">
                You can review submitted reports and next steps in{" "}
                <Link href={availability.supportPath} className="font-semibold underline">
                  Support history
                </Link>
                .
              </p>
            ) : null}
          </div>
        ) : null}

        {submitState === "retryable_error" ||
        submitState === "service_unavailable" ||
        submitState === "disabled" ||
        submitState === "validation_error" ? (
          <div className="space-y-2 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50">
            <p>Your report draft is saved locally in this browser.</p>
            {supportFallbackPath ? (
              <p>
                You can review submitted reports and next steps in{" "}
                <Link href={supportFallbackPath} className="font-semibold underline">
                  Support history
                </Link>
                .
              </p>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
