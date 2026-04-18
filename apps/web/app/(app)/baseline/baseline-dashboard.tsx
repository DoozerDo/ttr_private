"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import { Alert } from "@/components/Alert";
import { FormButton, SecondaryActionLink } from "@/components/FormButton";
import {
  parseComplianceError,
  readResponsePayload,
  type ParsedInsufficientExtractedTextError,
} from "@/lib/compliance/parseComplianceError";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import {
  BaselineDto,
  archiveBaseline,
  describeBaselineMutationError,
  listBaselines,
  restoreBaseline,
  BASELINE_LIBRARY_CAP,
} from "@/lib/baselines";
import { formatDateTime } from "@/lib/format-date";
import { getBaselineDetailsHref } from "@/src/navigation/routes";
import { publishBaselineUpdated } from "@/src/lib/baseline-sync";
import { ttrComponents } from "@/app/(app)/ui/ttrStyles";
import { OverflowMenu } from "./_components/OverflowMenu";
import { SetupModuleCard } from "./_components/SetupModuleCard";
import { setBaselineName } from "./_components/selectionStore";
import { BaselineUnlockProgress } from "@/src/components/baseline/BaselineUnlockProgress";
import { getBaselineCardActionFlags } from "@/lib/baselineCardActions";
import { partitionBaselines } from "@/lib/baselinePartition";

interface BaselineDashboardProps {
  initialBaselines: BaselineDto[];
  initialFetchError?: string | null;
  selectedBaselineId?: string | null;
  showBaselineCreationControls?: boolean;
}

const getDuplicateUploadMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;

  const maybeCode = (data as { code?: unknown }).code;
  const errorBody = (data as { error?: Record<string, unknown> }).error;
  const duplicateCode =
    (typeof maybeCode === "string" ? maybeCode : undefined) ??
    (typeof errorBody?.code === "string" ? errorBody.code : undefined);

  const topLevelMessage =
    typeof (data as { message?: unknown }).message === "string"
      ? ((data as { message?: unknown }).message as string)
      : null;

  if (
    duplicateCode !== "BASELINE_DUPLICATE" &&
    duplicateCode !== "CONFLICT" &&
    topLevelMessage !== "This file has already been uploaded."
  ) {
    return null;
  }

  if (typeof errorBody?.message === "string") {
    return errorBody.message;
  }

  if (topLevelMessage) {
    return topLevelMessage;
  }

  return "This file has already been uploaded.";
};

const getLibraryCapMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const maybeCode = (data as { code?: unknown }).code;
  const errorBody = (data as { error?: Record<string, unknown> }).error;
  const capCode =
    (typeof maybeCode === "string" ? maybeCode : undefined) ??
    (typeof errorBody?.code === "string" ? errorBody.code : undefined);

  if (capCode !== "BASELINE_LIBRARY_CAP_REACHED") return null;
  return (
    (typeof errorBody?.message === "string" ? errorBody.message : null) ??
    `Maximum of ${BASELINE_LIBRARY_CAP} active baselines reached.`
  );
};

const sortBaselinesNewestFirst = (baselines: BaselineDto[]) =>
  [...baselines].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

const resolveNextActiveBaselineId = (
  baselines: BaselineDto[],
  previousSelectedId: string | null | undefined,
) => {
  const activeBaselines = sortBaselinesNewestFirst(baselines).filter(
    (baseline) => baseline.status !== "ARCHIVED",
  );

  if (!activeBaselines.length) return null;

  if (previousSelectedId) {
    const stillActive = activeBaselines.find((baseline) => baseline.id === previousSelectedId);
    if (stillActive) return stillActive.id;
  }

  return activeBaselines[0]?.id ?? null;
};

export function BaselineDashboard({
  initialBaselines,
  initialFetchError,
  selectedBaselineId,
  showBaselineCreationControls = true,
}: BaselineDashboardProps) {
  const [baselines, setBaselines] = useState<BaselineDto[]>(initialBaselines);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficientTextError, setInsufficientTextError] = useState<
    ParsedInsufficientExtractedTextError | null
  >(null);
  const [duplicateErrorDetail, setDuplicateErrorDetail] = useState<string | null>(
    null,
  );
  const [capacityErrorDetail, setCapacityErrorDetail] = useState<string | null>(null);
  const [archivingBaselineId, setArchivingBaselineId] = useState<string | null>(
    null,
  );
  const [selectedBaselineDetails, setSelectedBaselineDetails] = useState<BaselineDto | null>(null);
  const [loadingSelectedBaselineDetails, setLoadingSelectedBaselineDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const setBaselineSelection = (baselineId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("baselineId", baselineId);
    const query = params.toString();
    const base = pathname ?? "/baseline";
    const target = query ? `${base}?${query}` : base;
    router.push(target);
    router.refresh();
  };

  const refreshBaselines = async () => {
    const latest = await listBaselines(true);
    setBaselines(latest);
  };

  const handleArchiveBaseline = async (baselineId: string) => {
    if (archivingBaselineId === baselineId) return;
    setError(null);
    setArchivingBaselineId(baselineId);

    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("[UI][ARCHIVE_CLICK]", baselineId);
      }
      await archiveBaseline(baselineId);
      const latest = await listBaselines(true);
      setBaselines(latest);
      publishBaselineUpdated({ baselineId, source: "baseline" });
      router.refresh();
      if (selectedBaselineId === baselineId) {
        const nextActive = resolveNextActiveBaselineId(latest, baselineId);
        if (nextActive) {
          setBaselineSelection(nextActive);
        } else {
          const params = new URLSearchParams(searchParams?.toString() ?? "");
          params.delete("baselineId");
          const query = params.toString();
          const base = pathname ?? "/baseline";
          router.replace(query ? `${base}?${query}` : base);
          setBaselineName(null);
        }
      }
    } catch (archiveError: unknown) {
      console.error("Unable to archive baseline", {
        baselineId,
        archiveError,
      });
      setError(describeBaselineMutationError(archiveError, "archive"));
    } finally {
      setArchivingBaselineId(null);
    }
  };

  const handleRestoreBaseline = async (baselineId: string) => {
    if (archivingBaselineId === baselineId) return;
    setError(null);
    setArchivingBaselineId(baselineId);
    try {
      await restoreBaseline(baselineId);
      const latest = await listBaselines(true);
      setBaselines(latest);
      publishBaselineUpdated({ baselineId, source: "baseline" });
      router.refresh();
      setBaselineSelection(baselineId);
    } catch (restoreError: unknown) {
      console.error("Unable to restore baseline", restoreError);
      const message =
        restoreError instanceof Error ? restoreError.message : "Unable to restore baseline right now.";
      setError(message);
    } finally {
      setArchivingBaselineId(null);
    }
  };

  const sortedBaselines = useMemo(
    () =>
      [...baselines].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [baselines],
  );

  const baselinePartition = useMemo(
    () => partitionBaselines({ baselines, currentBaselineId: selectedBaselineId ?? null }),
    [baselines, selectedBaselineId],
  );

  const activeBaselines = baselinePartition.activeBaselines;
  const archivedBaselines = baselinePartition.archivedBaselines;
  const activeBaselineCount = activeBaselines.length;
  const uploadLimitReached = activeBaselineCount >= BASELINE_LIBRARY_CAP;

  const selectedBaselineName = useMemo(
    () =>
      sortedBaselines.find((baseline) => baseline.id === selectedBaselineId)
        ?.originalFilename ?? null,
    [sortedBaselines, selectedBaselineId],
  );

  useEffect(() => {
    const selectedStillActive =
      selectedBaselineId &&
      activeBaselines.some((baseline) => baseline.id === selectedBaselineId);
    if (selectedBaselineId && !selectedStillActive) {
      setBaselineName(null);
      if (searchParams?.get("baselineId") === selectedBaselineId) {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.delete("baselineId");
        const query = params.toString();
        const base = pathname ?? "/baseline";
        router.replace(query ? `${base}?${query}` : base);
      }
      return;
    }

    setBaselineName(selectedBaselineName);
  }, [activeBaselines, pathname, router, searchParams, selectedBaselineId, selectedBaselineName]);

  const fetchBaselineDetails = useCallback(async (baselineId: string) => {
    setLoadingSelectedBaselineDetails(true);
    try {
      const response = await fetch(`/api/baselines/${encodeURIComponent(baselineId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        setSelectedBaselineDetails(null);
        return;
      }
      const payload = (await response.json()) as BaselineDto;
      setSelectedBaselineDetails(payload);
    } catch {
      setSelectedBaselineDetails(null);
    } finally {
      setLoadingSelectedBaselineDetails(false);
    }
  }, []);

  const activeBaselineId = baselinePartition.currentBaseline?.id ?? null;

  const renderedActiveBaselines = useMemo(() => {
    const current = baselinePartition.currentBaseline;
    if (!current) return baselinePartition.libraryBaselines;
    return [current, ...baselinePartition.libraryBaselines];
  }, [baselinePartition.currentBaseline, baselinePartition.libraryBaselines]);

  useEffect(() => {
    if (!activeBaselineId) {
      setSelectedBaselineDetails(null);
      return;
    }

    void fetchBaselineDetails(activeBaselineId);

    const timer = window.setInterval(() => {
      void fetchBaselineDetails(activeBaselineId);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [activeBaselineId, fetchBaselineDetails]);

  const baselineUnlockState = useMemo(() => {
    const baseline = selectedBaselineDetails;

    if (!baseline) {
      return {
        progressPercent: activeBaselineId ? 28 : 0,
        milestoneLabel: "Baseline created",
        isBaselineReady: false,
      };
    }

    const sections = baseline.sections ?? [];
    const normalizedSections = sections.map((section) => ({
      type: section.sectionType?.toUpperCase() ?? "",
      title: (section.title ?? "").toLowerCase(),
      content: (section.content ?? "").toLowerCase(),
    }));

    const hasSectionType = (sectionType: string) =>
      normalizedSections.some((section) => section.type === sectionType);

    const containsAnySignal = (patterns: RegExp[]) =>
      normalizedSections.some((section) => {
        const source = `${section.title} ${section.content}`;
        return patterns.some((pattern) => pattern.test(source));
      });

    const hasCareerHistory =
      hasSectionType("EXPERIENCE") || hasSectionType("PROJECT") || normalizedSections.length >= 2;
    const hasLeadershipScope = containsAnySignal([
      /\blead(er(ship)?|managed|manager|director|head|vp|executive)\b/i,
      /\bscope\b/i,
      /\breport(s|ing)?\b/i,
    ]);
    const hasSystemsContext =
      hasSectionType("SKILLS") ||
      containsAnySignal([
        /\bsystem(s)?\b/i,
        /\bplatform(s)?\b/i,
        /\bincident\b/i,
        /\boperations?\b/i,
        /\btooling\b/i,
      ]);

    const hasSummary = hasSectionType("SUMMARY");
    const hasEducationOrProjects = hasSectionType("EDUCATION") || hasSectionType("PROJECT");

    let progressPercent = 0;
    progressPercent = Math.max(progressPercent, 28);
    if (hasCareerHistory) progressPercent = Math.max(progressPercent, 45);
    if (hasLeadershipScope) progressPercent = Math.max(progressPercent, 65);
    if (hasSystemsContext) progressPercent = Math.max(progressPercent, 82);
    if (hasSummary || hasEducationOrProjects) progressPercent = Math.max(progressPercent, 92);

    const isBaselineReady =
      hasCareerHistory &&
      hasLeadershipScope &&
      hasSystemsContext &&
      hasSummary &&
      (hasEducationOrProjects || normalizedSections.length >= 4);

    if (isBaselineReady) {
      progressPercent = 100;
    }

    const milestoneLabel =
      progressPercent <= 28
        ? "Baseline created"
        : progressPercent <= 45
          ? "Career history confirmed"
          : progressPercent <= 65
            ? "Leadership and scope clarified"
            : progressPercent <= 82
              ? "Systems and operational context added"
              : progressPercent < 100
                ? "Final baseline validation"
                : "Baseline ready";

    return {
      progressPercent,
      milestoneLabel,
      isBaselineReady,
    };
  }, [activeBaselineId, selectedBaselineDetails]);
  const uploadBaselineFile = async (fileToUpload: File) => {
    if (isUploading) return;
    setError(null);
    setDuplicateErrorDetail(null);
    setCapacityErrorDetail(null);
    setIsUploading(true);
    setInsufficientTextError(null);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      const response = await fetch("/api/baselines", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const payload = await readResponsePayload(response);

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return;
      }

      if (!response.ok) {
        const compliance = parseComplianceError({
          status: response.status,
          payload,
        });
        if (compliance?.type === "insufficient_extracted_text") {
          setInsufficientTextError(compliance);
          setError(null);
          setDuplicateErrorDetail(null);
          return;
        }

        const duplicateDetail = getDuplicateUploadMessage(payload);
        if (duplicateDetail) {
          setError(null);
          setDuplicateErrorDetail(duplicateDetail);
          return;
        }

        const capacityDetail = getLibraryCapMessage(payload);
        if (capacityDetail) {
          setError(null);
          setCapacityErrorDetail(capacityDetail);
          return;
        }

        const fallbackMessage =
          typeof payload === "object" && payload !== null
            ? (payload as Record<string, unknown>).message ??
              (payload as Record<string, unknown>).error
            : undefined;
        const message =
          typeof fallbackMessage === "string" ? fallbackMessage : "Upload failed";
        setError(message);
        return;
      }

      const baselineRecord = payload as BaselineDto;

      setBaselines((previous) => {
        const filtered = previous.filter((entry) => entry.id !== baselineRecord.id);
        return [baselineRecord, ...filtered];
      });

      try {
        await refreshBaselines();
      } catch (refreshError) {
        console.error("Unable to refresh baselines after upload", refreshError);
      }
      setBaselineSelection(baselineRecord.id);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (uploadError) {
      console.error("Upload failed", uploadError);
      setError("Unable to add baseline right now.");
      setDuplicateErrorDetail(null);
    } finally {
      setIsUploading(false);
    }
  };

  const triggerUploadClick = useCallback(() => {
    if (isUploading) return;
    fileInputRef.current?.click();
  }, [isUploading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleUploadRequest = () => {
      triggerUploadClick();
    };
    window.addEventListener("baselineUploadAgainRequest", handleUploadRequest);
    return () => {
      window.removeEventListener("baselineUploadAgainRequest", handleUploadRequest);
    };
  }, [triggerUploadClick]);

  return (
    <SetupModuleCard
      label="BASELINE"
      title=""
      description=""
      data-baseline-renderer="dashboard"
      data-baseline-build="archive-e2e-v1"
      data-current-baseline-id={activeBaselineId ?? ""}
      data-library-baseline-ids={baselinePartition.libraryBaselines.map((baseline) => baseline.id).join(",")}
      primaryAction={
        showBaselineCreationControls ? (
          <FormButton onClick={triggerUploadClick} disabled={isUploading || uploadLimitReached}>
            {isUploading ? "Adding..." : uploadLimitReached ? "Maximum reached" : "Add baseline"}
          </FormButton>
        ) : null
      }
    >
      {showBaselineCreationControls ? (
        <>
          <input
            id="baselineUpload"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={async (event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              if (!selected) return;
              await uploadBaselineFile(selected);
            }}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              border: 0,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
            disabled={isUploading || uploadLimitReached}
          />

          {file ? (
            <p className="text-xs text-slate-400">Selected: {file.name}</p>
          ) : null}
          {selectedBaselineName ? (
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
              Selected: {selectedBaselineName}
            </p>
          ) : null}

          {activeBaselineId ? (
            <BaselineUnlockProgress
              progressPercent={baselineUnlockState.progressPercent}
              milestoneLabel={
                loadingSelectedBaselineDetails ? "Baseline created" : baselineUnlockState.milestoneLabel
              }
              isBaselineReady={baselineUnlockState.isBaselineReady}
              onContinue={() => {
                if (!activeBaselineId) return;
                router.push(getBaselineDetailsHref(activeBaselineId));
              }}
            />
          ) : null}

          {duplicateErrorDetail ? (
            <p className="text-sm text-slate-400">{duplicateErrorDetail}</p>
          ) : null}
          {capacityErrorDetail ? (
            <p className="text-sm text-slate-400">{capacityErrorDetail}</p>
          ) : null}
          {insufficientTextError ? (
            <InsufficientExtractedText error={insufficientTextError} />
          ) : error ? (
            <div style={ttrComponents.dangerBox}>
              <p className="m-0 text-[13px]">{error}</p>
            </div>
          ) : null}

          <div className="h-px bg-white/10" />
        </>
      ) : null}

      {initialFetchError ? (
        <Alert intent="error" title="Unable to load baselines">
          <p className="text-sm text-current">{initialFetchError}</p>
        </Alert>
      ) : null}

      {sortedBaselines.length === 0 ? (
        initialFetchError ? null : (
          <p className="m-0 text-[13px] text-slate-400">
            No baselines yet.
          </p>
        )
      ) : (
        <div className="space-y-3" data-testid="baseline-dashboard-list">
          <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
            {activeBaselineCount} of {BASELINE_LIBRARY_CAP} active baselines
          </p>
          {renderedActiveBaselines.map((baseline) => {
            const isSelected = baseline.id === activeBaselineId;
            const actionFlags = getBaselineCardActionFlags({
              isCurrentBaseline: isSelected,
              isEditable: true,
              isReady: true,
              isArchived: baseline.status === "ARCHIVED",
            });
            const cardClasses = [
              "rounded-2xl border border-white/10 bg-slate-950/40 p-4",
              isSelected ? "ring-2 ring-cyan-300/40" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={baseline.id}
                className={cardClasses}
                data-testid={`baseline-dashboard-card:${baseline.id}`}
                data-archive-enabled={actionFlags.showArchive ? "true" : "false"}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {baseline.originalFilename}
                    </p>
                    {isSelected ? (
                      <span className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.35em] text-cyan-100">
                        Selected
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <SecondaryActionLink href={getBaselineDetailsHref(baseline.id)}>
                      View details
                    </SecondaryActionLink>
                    <FormButton
                      variant="secondary"
                      onClick={() => setBaselineSelection(baseline.id)}
                      disabled={isSelected}
                      className="shrink-0"
                    >
                      {isSelected ? "Selected" : "Use this baseline"}
                    </FormButton>
                    {actionFlags.showArchive ? (
                      <div data-testid={`baseline-dashboard-archive:${baseline.id}`}>
                        <OverflowMenu
                          onArchive={() => handleArchiveBaseline(baseline.id)}
                          loading={archivingBaselineId === baseline.id}
                          ariaLabel={`Baseline overflow actions ${baseline.id}`}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  Updated {formatDateTime(baseline.updatedAt)}
                </p>
              </div>
            );
          })}
          {showBaselineCreationControls && uploadLimitReached ? (
            <p className="text-sm text-slate-400">
              Maximum of {BASELINE_LIBRARY_CAP} active baselines reached.
            </p>
          ) : showBaselineCreationControls ? (
            <FormButton onClick={triggerUploadClick} disabled={isUploading}>
              Add baseline
            </FormButton>
          ) : null}
          {archivedBaselines.length ? (
            <div className="space-y-3 pt-3">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Archived baselines</p>
              {archivedBaselines.map((baseline) => (
                <div
                  key={baseline.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/25 p-4 opacity-90"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {baseline.originalFilename}
                      </p>
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.35em] text-slate-400">
                        Archived
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <SecondaryActionLink href={getBaselineDetailsHref(baseline.id)}>
                        View details
                      </SecondaryActionLink>
                      <FormButton
                        variant="secondary"
                        onClick={() => void handleRestoreBaseline(baseline.id)}
                        className="shrink-0"
                      >
                        Restore
                      </FormButton>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Updated {formatDateTime(baseline.updatedAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </SetupModuleCard>
  );
}
