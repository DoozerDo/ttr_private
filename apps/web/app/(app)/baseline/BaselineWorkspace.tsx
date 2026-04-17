"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import type { BaselineDto } from "@/lib/baselines";
import { JobIngestionForm } from "@/app/(app)/jobs/_components/JobIngestionForm";
import { trackEvent } from "@/src/lib/analytics";
import { BaselineDashboard } from "./baseline-dashboard";
import { JobsHub } from "./_components/JobsHub";
import { WorkspaceRunner } from "./_components/WorkspaceRunner";

type BaselineWorkspaceProps = {
  initialBaselines: BaselineDto[];
  initialFetchError?: string | null;
  initialBaselineId?: string | null;
  initialJobId?: string | null;
  entrySource?: "studio_post_apply" | null;
  showBaselineCreationControls?: boolean;
};

const NOTICE_MESSAGE =
  "That selection is no longer available. Please pick a baseline and job to continue.";

const resolveParam = (value: string | string[] | null | undefined): string | null => {
  if (Array.isArray(value)) {
    return value.length ? value[0] : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
};

const buildTargetUrl = (params: URLSearchParams, pathname?: string | null) => {
  const basePath = pathname ?? "/baseline";
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
};

type FlowStep = {
  key: string;
  label: string;
  complete: boolean;
};

export type TargetWorkflowState = {
  hasBaselineSelected: boolean;
  hasJob: boolean;
  hasScore: boolean;
};

export function useTargetWorkflowState({
  baselineId,
  jobId,
  hasMatchingScore,
}: {
  baselineId: string | null;
  jobId: string | null;
  hasMatchingScore: boolean;
}): TargetWorkflowState {
  return useMemo(
    () => ({
      hasBaselineSelected: Boolean(baselineId),
      hasJob: Boolean(jobId),
      hasScore: Boolean(baselineId && jobId && hasMatchingScore),
    }),
    [baselineId, hasMatchingScore, jobId],
  );
}

export function buildTargetWorkflowSteps(workflowState: TargetWorkflowState): FlowStep[] {
  return [
    {
      key: "baseline-selected",
      label: "Baseline selected",
      complete: workflowState.hasBaselineSelected,
    },
    {
      key: "job-added",
      label: "Job added",
      complete: workflowState.hasJob,
    },
    {
      key: "score-generated",
      label: "Score generated",
      complete: workflowState.hasScore,
    },
  ];
}

function WorkflowProgressStrip({ steps }: { steps: FlowStep[] }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
      aria-label="Target workflow progress"
    >
      {steps.map((step, index) => (
        <div key={step.key} className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={[
                "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold",
                step.complete
                  ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-100"
                  : "border-white/15 bg-slate-950/40 text-slate-500",
              ].join(" ")}
              aria-hidden="true"
            >
              {step.complete ? "✓" : index + 1}
            </span>
            <span
              className={[
                "text-sm font-medium",
                step.complete ? "text-slate-100" : "text-slate-400",
              ].join(" ")}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 ? (
            <span className="h-px w-6 bg-white/10" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function BaselineWorkspace({
  initialBaselines,
  initialFetchError,
  initialBaselineId,
  initialJobId,
  entrySource = null,
  showBaselineCreationControls = true,
}: BaselineWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [notice, setNotice] = useState<string | null>(null);
  const baselineClearedRef = useRef(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [activeScorePair, setActiveScorePair] = useState<{
    baselineId: string;
    jobId: string;
  } | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const momentumEntryViewedRef = useRef(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const rawBaselineParam = resolveParam(searchParams.get("baselineId"));
  const rawJobParam = resolveParam(searchParams.get("jobId"));

  const baselineId = hasHydrated
    ? rawBaselineParam
    : rawBaselineParam ?? initialBaselineId ?? null;
  const jobId = hasHydrated ? rawJobParam : rawJobParam ?? initialJobId ?? null;

  const baselineExists = useMemo(() => {
    if (!baselineId) return true;
    return initialBaselines.some((baseline) => baseline.id === baselineId);
  }, [baselineId, initialBaselines]);

  const selectedBaseline = useMemo(
    () => initialBaselines.find((baseline) => baseline.id === baselineId) ?? null,
    [baselineId, initialBaselines],
  );
  const isMomentumEntry = entrySource === "studio_post_apply";

  useEffect(() => {
    if (!isMomentumEntry || momentumEntryViewedRef.current) return;
    momentumEntryViewedRef.current = true;
    trackEvent("target_momentum_entry_viewed", {
      source: "studio_post_apply",
      baselineId: baselineId && baselineExists ? baselineId : null,
      jobId: null,
    });
  }, [baselineExists, baselineId, isMomentumEntry]);

  const targetWorkflowState = useTargetWorkflowState({
    baselineId: baselineId && baselineExists ? baselineId : null,
    jobId,
    hasMatchingScore:
      Boolean(activeScorePair) &&
      activeScorePair?.baselineId === baselineId &&
      activeScorePair?.jobId === jobId,
  });

  const workflowSteps = useMemo(
    () => buildTargetWorkflowSteps(targetWorkflowState),
    [targetWorkflowState],
  );

  const shouldCollapseForNoJobs = !isMomentumEntry && (jobCount === 0 || jobCount === null);

  const removeParamFromUrl = useCallback(
    (key: "baselineId" | "jobId") => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete(key);
      const target = buildTargetUrl(params, pathname);
      router.replace(target);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setActiveScorePair((current) => {
      if (!current) return null;
      if (current.baselineId === baselineId && current.jobId === jobId) return current;
      return null;
    });
  }, [baselineId, jobId]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!baselineId || baselineExists) {
      baselineClearedRef.current = false;
      return;
    }

    if (baselineClearedRef.current) return;
    baselineClearedRef.current = true;
    removeParamFromUrl("baselineId");
    setNotice(NOTICE_MESSAGE);
  }, [baselineExists, baselineId, hasHydrated, removeParamFromUrl]);

  const handleJobMissing = useCallback(() => {
    removeParamFromUrl("jobId");
    setNotice(NOTICE_MESSAGE);
  }, [removeParamFromUrl]);

  const handleMomentumJobResolved = useCallback(
    (resolvedJobId: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (baselineId && baselineExists) {
        params.set("baselineId", baselineId);
      }
      params.set("jobId", resolvedJobId);
      params.set("entry", "studio_post_apply");
      const target = buildTargetUrl(params, pathname);
      router.replace(target);
      router.refresh();
    },
    [baselineExists, baselineId, pathname, router, searchParams],
  );

  useEffect(() => {
    if (notice && baselineId && jobId) {
      setNotice(null);
    }
  }, [baselineId, jobId, notice]);

  return (
    <div className="space-y-6">
      {isMomentumEntry ? (
        <section
          className="space-y-4 rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(8,47,73,0.92),rgba(15,23,42,0.98))] p-6 md:p-8 shadow-[0_20px_70px_rgba(2,6,23,0.45)]"
          data-testid="target-momentum-hero"
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
              Next role
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-50 md:text-[36px]">
              Let's find your next role
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-slate-200">
              Your baseline is ready. Paste the next job and we will score it.
            </p>
          </div>
          {selectedBaseline ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                Baseline locked
              </span>
              <span className="text-sm text-slate-200">
                {selectedBaseline.originalFilename ?? selectedBaseline.id}
              </span>
            </div>
          ) : null}
          <JobIngestionForm
            momentumEntry
            baselineId={baselineId}
            entrySource="studio_post_apply"
            autoFocusDescription
            onResolved={handleMomentumJobResolved}
            onCancel={() => {}}
          />
        </section>
      ) : null}
      <WorkflowProgressStrip steps={workflowSteps} />
      {notice ? (
        <Alert intent="warning" title="Selection reset">
          <p className="text-sm">{notice}</p>
        </Alert>
      ) : null}

      <div
        className={[
          "grid grid-cols-1 gap-6",
          isMomentumEntry
            ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)]"
            : shouldCollapseForNoJobs
              ? "xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1.35fr)]"
              : "xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1.35fr)_minmax(280px,1fr)]",
        ].join(" ")}
        data-testid="target-workspace-layout"
      >
        <section className="space-y-3 xl:min-w-0" data-testid="target-baseline-column">
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            {isMomentumEntry ? "Baseline context" : "Baseline"}
          </p>
          <BaselineDashboard
            initialBaselines={initialBaselines}
            initialFetchError={initialFetchError}
            selectedBaselineId={baselineId}
            showBaselineCreationControls={showBaselineCreationControls}
          />
          <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
            Your resume becomes a structured source of truth for compatibility scoring.
          </p>
        </section>

        <section className="space-y-3 xl:min-w-0" data-testid="target-job-column">
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Job description
          </p>
          <div className="flex h-full flex-col">
            <JobsHub
              selectedJobId={jobId}
              onJobMissing={handleJobMissing}
              momentumEntry={isMomentumEntry}
              onJobCountChange={setJobCount}
            />
          </div>
        </section>

        {!shouldCollapseForNoJobs ? (
          <section
            className={[
              "space-y-3 xl:min-w-0",
              isMomentumEntry ? "xl:col-span-2" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-testid="target-result-column"
          >
            <p className="px-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              Compatibility result
            </p>
            <WorkspaceRunner
              key={`${baselineId ?? "none"}:${jobId ?? "none"}`}
              baselineId={baselineId}
              jobId={jobId}
              entrySource={entrySource}
              onMatchingScoreChange={setActiveScorePair}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
