"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { readLastAnalysis, type StoredAnalysisRecord } from "@/app/(app)/lib/session";

const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;

type ScreenshotPayload = {
  base64: string;
  mimeType: string;
  name: string;
  size: number;
};

type ReportBugModalProps = {
  open: boolean;
  onClose: () => void;
  initialEmail?: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reader.abort();
      reject(new Error("Unable to read the screenshot file."));
    };

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to parse the screenshot file."));
        return;
      }

      const parts = reader.result.split(",");
      resolve(parts.length > 1 ? parts[1] : parts[0]);
    };

    reader.readAsDataURL(file);
  });
}

export function ReportBugModal({ open, onClose, initialEmail }: ReportBugModalProps) {
  const pathname = usePathname() ?? "/";
  const [message, setMessage] = useState("");
  const [tryingToDo, setTryingToDo] = useState("");
  const [expected, setExpected] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [screenshot, setScreenshot] = useState<ScreenshotPayload | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [storedAnalysis, setStoredAnalysis] = useState<StoredAnalysisRecord | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMessage("");
    setTryingToDo("");
    setExpected("");
    setEmail(initialEmail ?? "");
    setScreenshot(null);
    setScreenshotError(null);
    setStatus("idle");
    setStatusMessage(null);
    setStoredAnalysis(readLastAnalysis());
  }, [initialEmail, open]);

  const pageUrl = useMemo(() => (typeof window !== "undefined" ? window.location.href : undefined), []);
  const userAgent = useMemo(() => (typeof navigator !== "undefined" ? navigator.userAgent : undefined), []);

  const handleScreenshotChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setScreenshot(null);
      setScreenshotError(null);
      return;
    }

    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshot(null);
      setScreenshotError("Screenshots must be smaller than 3 MB.");
      event.target.value = "";
      return;
    }

    setScreenshotError(null);

    try {
      const payload = await readFileAsBase64(file);
      setScreenshot({
        base64: payload,
        mimeType: file.type || "image/png",
        name: file.name,
        size: file.size,
      });
    } catch (error) {
      setScreenshot(null);
      setScreenshotError(error instanceof Error ? error.message : "Unable to read screenshot.");
    } finally {
      event.target.value = "";
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!message.trim() || status === "loading") {
        return;
      }

      setStatus("loading");
      setStatusMessage(null);

      const analysisContext = storedAnalysis
        ? {
            savedAt: storedAnalysis.savedAt,
            baselineId: storedAnalysis.baselineId,
            jobId: storedAnalysis.jobId,
            jobTitle: storedAnalysis.jobTitle,
            company: storedAnalysis.company,
            fitScore: storedAnalysis.fitScore,
            verdict: storedAnalysis.verdict,
            summary: storedAnalysis.summary,
            jobSource: storedAnalysis.jobSource,
            analysis: storedAnalysis.analysis,
          }
        : undefined;

      const payload = {
        message: message.trim(),
        tryingToDo: tryingToDo.trim() || undefined,
        expected: expected.trim() || undefined,
        email: email.trim() || undefined,
        screenshotBase64: screenshot?.base64,
        screenshotMimeType: screenshot?.mimeType,
        route: pathname,
        pageUrl,
        userAgent,
        baselineId: storedAnalysis?.baselineId,
        jobId: storedAnalysis?.jobId,
        score:
          storedAnalysis?.fitScore ??
          (typeof storedAnalysis?.analysis?.score === "number" ? storedAnalysis.analysis.score : undefined),
        analysisContext,
      };

      try {
        const response = await fetch("/api/support/report-bug", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(errorPayload?.message ?? "Unable to submit bug report right now.");
        }

        const body = (await response.json().catch(() => null)) as { issueNumber?: number } | null;
        const reference = body?.issueNumber
          ? `Bug reported successfully. Reference: #${body.issueNumber}`
          : "Bug reported successfully.";

        setStatus("success");
        setStatusMessage(reference);
      } catch (error) {
        setStatus("error");
        setStatusMessage(
          error instanceof Error ? error.message : "Unable to submit bug report right now.",
        );
      }
    },
    [email, expected, message, pathname, pageUrl, screenshot, storedAnalysis, tryingToDo, userAgent, status],
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Report a bug"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
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
            <p className="text-sm text-slate-400">We will attach runtime context and look into it.</p>
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
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            minLength={5}
            maxLength={4000}
            className="h-32 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/70"
            placeholder="Tell us what went wrong"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-200">
            <span>What were you trying to do?</span>
            <textarea
              value={tryingToDo}
              onChange={(event) => setTryingToDo(event.target.value)}
              maxLength={2000}
              className="h-20 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
              placeholder="Context helps us reproduce the flow"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-200">
            <span>What did you expect?</span>
            <textarea
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              maxLength={2000}
              className="h-20 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
              placeholder="The outcome you were expecting"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-200">
            <span>Screenshot (optional)</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleScreenshotChange}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
            />
            {screenshot?.name ? (
              <p className="text-xs text-slate-400">
                Attached: {screenshot.name} ({Math.round(screenshot.size / 1024)} KB)
              </p>
            ) : null}
            {screenshotError ? <p className="text-xs text-rose-300">{screenshotError}</p> : null}
          </label>
          <label className="space-y-1 text-sm text-slate-200">
            <span>Email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={256}
              className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-300/70"
              placeholder="you@example.com"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={status === "loading"}
            className="flex-1 rounded-2xl border border-amber-400/60 bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400/90 hover:bg-amber-400/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Reporting..." : "Send bug report"}
          </button>
          <span
            className={`text-xs ${
              status === "success" ? "text-emerald-300" : status === "error" ? "text-rose-300" : "text-slate-400"
            }`}
            role="status"
            aria-live="polite"
          >
            {statusMessage ?? "We capture runtime context automatically."}
          </span>
        </div>
      </form>
    </div>
  );
}
