"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import type { BaselineDto } from "@/lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";
import { ProgressRail, type ProgressRailStepSchema } from "./_components/ProgressRail";
import { JobsHub } from "./_components/JobsHub";
import { WorkspaceRunner } from "./_components/WorkspaceRunner";

type BaselineWorkspaceProps = {
  initialBaselines: BaselineDto[];
  initialFetchError?: string | null;
  initialBaselineId?: string | null;
  initialJobId?: string | null;
};

const NOTICE_MESSAGE =
  "Previous selection no longer exists. Please select a baseline and job.";

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

const TARGET_RAIL_STEP_KEYS = ["baseline", "job", "match", "results"] as const;
type TargetRailStepKey = (typeof TARGET_RAIL_STEP_KEYS)[number];

const TARGET_RAIL_STEPS: ProgressRailStepSchema<TargetRailStepKey>[] = [
  { key: "baseline", label: "Resume" },
  { key: "job", label: "Job" },
  { key: "match", label: "Match", processingLabel: "Scoring" },
  { key: "results", label: "Results" },
];

export function BaselineWorkspace({
  initialBaselines,
  initialFetchError,
  initialBaselineId,
  initialJobId,
}: BaselineWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [notice, setNotice] = useState<string | null>(null);
  const baselineClearedRef = useRef(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [railState, setRailState] = useState<{
    isScoring: boolean;
    isCompletionMoment: boolean;
    isComplianceBlocked: boolean;
    isPreparingMatch: boolean;
  }>({
    isScoring: false,
    isCompletionMoment: false,
    isComplianceBlocked: false,
    isPreparingMatch: false,
  });

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

  const removeParamFromUrl = useCallback(
    (key: "baselineId" | "jobId") => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.delete(key);
      const target = buildTargetUrl(params, pathname);
      router.replace(target);
    },
    [pathname, router, searchParams],
  );

  const clearSelections = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("baselineId");
    params.delete("jobId");
    const target = buildTargetUrl(params, pathname);
    router.replace(target);
  }, [pathname, router, searchParams]);

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

  useEffect(() => {
    if (notice && baselineId && jobId) {
      setNotice(null);
    }
  }, [baselineId, jobId, notice]);

  const currentStepKey: TargetRailStepKey = !baselineId
    ? "baseline"
    : !jobId
      ? "job"
      : "match";

  const completedStepKeys: TargetRailStepKey[] = [];
  if (baselineId) {
    completedStepKeys.push("baseline");
  }
  if (jobId) {
    completedStepKeys.push("job");
  }

  const blockedStepKey: TargetRailStepKey | undefined = railState.isComplianceBlocked
    ? "match"
    : undefined;
  const highlightStepKey: TargetRailStepKey | undefined = railState.isCompletionMoment
    ? "results"
    : undefined;
  const processingStepKeys: TargetRailStepKey[] =
    railState.isPreparingMatch || railState.isScoring ? ["match"] : [];

  return (
    <div className="space-y-6">
      {notice ? (
        <Alert intent="warning" title="Selection reset">
          <p className="text-sm">{notice}</p>
        </Alert>
      ) : null}

      <div className="w-full grid grid-cols-1 gap-6">
        <div className="w-full lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
            <div className="lg:sticky lg:top-10">
              <ProgressRail
                heading="Targeting steps"
                steps={TARGET_RAIL_STEPS}
                currentStepKey={currentStepKey}
                completedStepKeys={completedStepKeys}
                blockedStepKey={blockedStepKey}
                isProcessing={railState.isScoring}
                processingStepKeys={processingStepKeys}
                highlightStepKey={highlightStepKey}
              />
            </div>

          <div className="w-full grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
            <BaselineDashboard
              initialBaselines={initialBaselines}
              initialFetchError={initialFetchError}
              selectedBaselineId={baselineId}
            />

            <div className="flex h-full flex-col">
              <JobsHub selectedJobId={jobId} onJobMissing={handleJobMissing} />
            </div>

            <WorkspaceRunner
              baselineId={baselineId}
              jobId={jobId}
              onAutoRunComplete={clearSelections}
              onProgressStateChange={setRailState}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
