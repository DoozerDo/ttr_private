"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { FormButton } from "@/components/FormButton";

type AnalyzeAnotherRoleBarProps = {
  baselineVersionId: string | null;
};

type LoosePayload = Record<string, unknown>;

function readStringField(payload: unknown, fields: string[]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as LoosePayload;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

export function AnalyzeAnotherRoleBar({ baselineVersionId }: AnalyzeAnotherRoleBarProps) {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const GENERIC_ANALYSIS_ERROR =
    "We couldn't complete the compatibility analysis. Please try running the analysis again.";

  const handleRunAnalysis = async () => {
    const description = jobDescription.trim();
    if (!description) {
      setError("Paste a job description to run compatibility analysis.");
      return;
    }
    if (!baselineVersionId) {
      setError("A baseline context is required before running another analysis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const createJobResponse = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawDescription: description }),
      });

      const createJobPayload = (await createJobResponse.json().catch(() => null)) as
        | LoosePayload
        | null;

      let resolvedJobId = readStringField(createJobPayload, ["id"]);

      if (createJobResponse.status === 409) {
        if (!resolvedJobId) {
          throw new Error("This job description already exists but could not be resolved.");
        }
      } else if (!createJobResponse.ok) {
        const message = readStringField(createJobPayload, ["message", "error"]);
        throw new Error(message ?? "Unable to save this job description.");
      }

      if (!resolvedJobId) {
        throw new Error("Job creation response was incomplete.");
      }

      const scoreResponse = await fetch("/api/fit-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseline_version_id: baselineVersionId,
          job: { id: resolvedJobId },
        }),
      });

      const scorePayload = (await scoreResponse.json().catch(() => null)) as LoosePayload | null;
      if (!scoreResponse.ok) {
        const message = readStringField(scorePayload, ["message", "error"]);
        throw new Error(message ?? "Unable to analyze this role right now.");
      }

      const assessmentId = readStringField(scorePayload, ["assessmentId", "assessment_id"]);
      const jobId =
        readStringField(scorePayload, ["jobId", "job_id"]) ??
        resolvedJobId;

      setJobDescription("");

      if (assessmentId) {
        await router.push(`/results?assessmentId=${encodeURIComponent(assessmentId)}`);
        return;
      }

      if (jobId) {
        await router.push(`/results?jobId=${encodeURIComponent(jobId)}`);
        return;
      }

      router.refresh();
    } catch {
      setError(GENERIC_ANALYSIS_ERROR);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="analyze-another-role" className="mt-8 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="space-y-1">
        <h3 className="text-lg font-semibold text-neutral-900">Analyze Another Role</h3>
        <p className="text-sm text-neutral-600">
          Paste another job description to compare against your baseline.
        </p>
      </header>

      <div className="mt-4 space-y-3">
        <textarea
          value={jobDescription}
          onChange={(event) => setJobDescription(event.target.value)}
          onKeyDown={(event) => {
            const isModifierEnter =
              event.key === "Enter" && (event.metaKey || event.ctrlKey);
            if (isModifierEnter && !loading) {
              event.preventDefault();
              void handleRunAnalysis();
            }
          }}
          rows={6}
          placeholder="Paste a job description here to compare against your baseline."
          className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
        />
        {error ? (
          <div className="space-y-2">
            <p className="text-sm text-rose-600">{error}</p>
            <button
              type="button"
              onClick={() => void handleRunAnalysis()}
              disabled={loading}
              className="text-sm font-medium text-neutral-700 underline decoration-neutral-400 underline-offset-4 transition hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retry
            </button>
          </div>
        ) : null}
        <FormButton onClick={() => void handleRunAnalysis()} disabled={loading}>
          {loading ? "Running analysis..." : "Run Compatibility Analysis"}
        </FormButton>
      </div>
    </section>
  );
}
