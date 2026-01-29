"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
import type { BaselineDto } from "@/lib/baselines";
import { BaselineDashboard } from "./baseline-dashboard";
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

  return (
    <div className="space-y-6">
      {notice ? (
        <Alert intent="warning" title="Selection reset">
          <p className="text-sm">{notice}</p>
        </Alert>
      ) : null}

      <div className="w-full grid grid-cols-1 gap-6 lg:grid-cols-3 items-stretch">
        <BaselineDashboard
          initialBaselines={initialBaselines}
          initialFetchError={initialFetchError}
          selectedBaselineId={baselineId}
        />

        <JobsHub selectedJobId={jobId} onJobMissing={handleJobMissing} />

        <WorkspaceRunner baselineId={baselineId} jobId={jobId} />
      </div>
    </div>
  );
}
