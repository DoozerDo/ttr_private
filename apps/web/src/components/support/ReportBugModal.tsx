"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { readLastAnalysis, type StoredAnalysisRecord } from "@/app/(app)/lib/session";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"];

const resolvedGitSha =
  process.env.NEXT_PUBLIC_GIT_SHA ??
  process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
  "";

type ReportBugModalProps = {
  open: boolean;
  onClose: () => void;
  initialEmail?: string;
};

type BugReportCreateResponse = {
  ok: boolean;
  reportId: string;
};

export function ReportBugModal({ open, onClose, initialEmail }: ReportBugModalProps) {
  const pathname = usePathname() ?? "/";
  const [whatHappened, setWhatHappened] = useState("");
  const [attemptedAction, setAttemptedAction] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [reporterEmail, setReporterEmail] = useState(initialEmail ?? "");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [storedAnalysis, setStoredAnalysis] = useState<StoredAnalysisRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWhatHappened("");
    setAttemptedAction("");
    setExpectedBehavior("");
    setReporterEmail(initialEmail ?? "");
    setScreenshot(null);
    setScreenshotError(null);
    setStatus("idle");
    setStatusMessage(null);
    setCreatedReportId(null);
    setStoredAnalysis(readLastAnalysis());
  }, [initialEmail, open]);

  const pageUrl = useMemo(() => (typeof window !== "undefined" ? window.location.href : ""), []);
  const userAgent = useMemo(() => (typeof navigator !== "undefined" ? navigator.userAgent : ""), []);

  const onScreenshotChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setScreenshotError(null);
    setScreenshot(null);
    if (!file) return;

    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      setScreenshotError("Screenshot must be PNG, JPEG, or WebP.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshotError("Screenshot must be 5 MB or smaller.");
      return;
    }
    setScreenshot(file);
  }, []);

  const isValid = whatHappened.trim().length >= 10;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isValid || status === "loading") return;

      setStatus("loading");
      setStatusMessage(null);

      const analysis = storedAnalysis?.analysis;
      const assessmentId =
        typeof analysis?.assessmentId === "string" ? analysis.assessmentId : undefined;
      const fitScore =
        storedAnalysis?.fitScore ??
        (typeof analysis?.score === "number" ? analysis.score : undefined);
      const runtimeContext = {
        timestamp: new Date().toISOString(),
        href: pageUrl || undefined,
        route: `${window.location.pathname}${window.location.search}`,
        pageLabel: document.title || undefined,
        baselineId: storedAnalysis?.baselineId || undefined,
        jobId: storedAnalysis?.jobId || undefined,
        assessmentId: assessmentId || undefined,
        fitScore: typeof fitScore === "number" ? fitScore : undefined,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        lastUserAction: window.sessionStorage.getItem("ttr:last-user-action") ?? undefined,
      };

      const formData = new FormData();
      formData.set("whatHappened", whatHappened.trim());
      if (attemptedAction.trim()) formData.set("attemptedAction", attemptedAction.trim());
      if (expectedBehavior.trim()) formData.set("expectedBehavior", expectedBehavior.trim());
      if (reporterEmail.trim()) formData.set("reporterEmail", reporterEmail.trim());
      formData.set("route", `${window.location.pathname}${window.location.search}`);
      formData.set("pageLabel", document.title || pathname);
      if (process.env.NEXT_PUBLIC_APP_VERSION) {
        formData.set("appVersion", process.env.NEXT_PUBLIC_APP_VERSION);
      }
      if (resolvedGitSha) {
        formData.set("gitSha", resolvedGitSha.slice(0, 40));
      }
      if (storedAnalysis?.baselineId) formData.set("baselineId", storedAnalysis.baselineId);
      if (assessmentId) formData.set("assessmentId", assessmentId);
      if (typeof fitScore === "number") formData.set("fitScore", String(fitScore));
      if (userAgent) formData.set("browserInfo", userAgent);
      formData.set("runtimeContext", JSON.stringify(runtimeContext));
      if (screenshot) formData.set("screenshot", screenshot);

      try {
        const response = await fetch("/api/bug-reports", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "Bug report failed to send. Please try again.");
        }

        const payload = (await response.json()) as BugReportCreateResponse;
        setStatus("success");
        setStatusMessage("Thanks - your report was submitted successfully.");
        setCreatedReportId(payload.reportId);
        setWhatHappened("");
        setAttemptedAction("");
        setExpectedBehavior("");
        setScreenshot(null);
        setScreenshotError(null);
      } catch (err) {
        setStatus("error");
        setStatusMessage(err instanceof Error ? err.message : "Bug report failed to send. Please try again.");
      }
    },
    [attemptedAction, expectedBehavior, isValid, pathname, pageUrl, reporterEmail, screenshot, status, storedAnalysis, userAgent, whatHappened],
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
            <h2 className="text-2xl font-semibold text-white">Report a bug</h2>
            <p className="text-sm text-slate-400">Tell us what happened. We attach runtime context automatically.</p>
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
            placeholder="Describe the problem"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-200">
            <span>What were you trying to do? (optional)</span>
            <textarea
              value={attemptedAction}
              onChange={(event) => setAttemptedAction(event.target.value)}
              maxLength={4000}
              className="h-20 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-200">
            <span>What did you expect? (optional)</span>
            <textarea
              value={expectedBehavior}
              onChange={(event) => setExpectedBehavior(event.target.value)}
              maxLength={4000}
              className="h-20 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-200">
            <span>Screenshot (optional)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onScreenshotChange}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
            />
            {screenshot ? <p className="text-xs text-slate-400">Attached: {screenshot.name}</p> : null}
            {screenshotError ? <p className="text-xs text-rose-300">{screenshotError}</p> : null}
          </label>
          <label className="space-y-1 text-sm text-slate-200">
            <span>Email (optional)</span>
            <input
              type="email"
              value={reporterEmail}
              onChange={(event) => setReporterEmail(event.target.value)}
              maxLength={256}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
              placeholder="you@example.com"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!isValid || status === "loading"}
            className="flex-1 rounded-2xl border border-amber-400/60 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/90 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Sending..." : "Send bug report"}
          </button>
          <span
            className={`text-xs ${status === "success" ? "text-emerald-300" : status === "error" ? "text-rose-300" : "text-slate-400"}`}
            role="status"
            aria-live="polite"
          >
            {statusMessage ??
              (isValid
                ? createdReportId
                  ? `Report ID: ${createdReportId}`
                  : "We only show success if your report is saved."
                : "Please enter at least 10 characters.")}
          </span>
        </div>
      </form>
    </div>
  );
}
