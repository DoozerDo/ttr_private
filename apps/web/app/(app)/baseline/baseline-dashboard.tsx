"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import { Alert } from "@/components/Alert";
import { FormButton, SecondaryActionLink } from "@/components/FormButton";
import {
  BaselineDto,
  BaselineUploadResponse,
  BaselineUploadStatus,
  archiveBaseline,
  listBaselines,
} from "@/lib/baselines";
import { markJourneyStepCompleted } from "@/src/lib/journeyNavStore";
import { formatDateTime } from "@/lib/format-date";
import { getBaselineDetailsHref } from "@/src/navigation/routes";
import { ttrComponents } from "@/app/(app)/ui/ttrStyles";
import { OverflowMenu } from "./_components/OverflowMenu";
import { SetupModuleCard } from "./_components/SetupModuleCard";
import { setBaselineName } from "./_components/selectionStore";

interface BaselineDashboardProps {
  initialBaselines: BaselineDto[];
  initialFetchError?: string | null;
  selectedBaselineId?: string | null;
}

const isBaselineUploadResponse = (
  value: unknown,
): value is BaselineUploadResponse =>
  Boolean(
    value &&
      typeof value === "object" &&
      "baseline" in value &&
      "uploadStatus" in value,
  );

const getDuplicateUploadMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;

  const maybeCode = (data as { code?: unknown }).code;
  const errorBody = (data as { error?: Record<string, unknown> }).error;
  const duplicateCode =
    (typeof maybeCode === "string" ? maybeCode : undefined) ??
    (typeof errorBody?.code === "string" ? errorBody.code : undefined);

  if (duplicateCode !== "BASELINE_DUPLICATE") return null;

  if (typeof errorBody?.message === "string") {
    return errorBody.message;
  }

  if (typeof (data as { message?: unknown }).message === "string") {
    return (data as { message?: unknown }).message as string;
  }

  return "This file matches a resume you’ve already uploaded. Use the existing version to continue.";
};

export function BaselineDashboard({
  initialBaselines,
  initialFetchError,
  selectedBaselineId,
}: BaselineDashboardProps) {
  const [baselines, setBaselines] = useState<BaselineDto[]>(initialBaselines);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateErrorDetail, setDuplicateErrorDetail] = useState<string | null>(
    null,
  );
  const [uploadStatus, setUploadStatus] = useState<BaselineUploadStatus | null>(
    null,
  );
  const [archivingBaselineId, setArchivingBaselineId] = useState<string | null>(
    null,
  );
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
    const latest = await listBaselines();
    setBaselines(latest);
  };

  const handleArchiveBaseline = async (baselineId: string) => {
    if (archivingBaselineId === baselineId) return;
    setError(null);
    setArchivingBaselineId(baselineId);

    try {
      await archiveBaseline(baselineId);
      setBaselines((previous) => previous.filter((entry) => entry.id !== baselineId));
    } catch (archiveError: unknown) {
      console.error("Unable to archive baseline", archiveError);
      const message =
        archiveError instanceof Error
          ? archiveError.message
          : "Unable to archive baseline right now.";
      setError(message);
    } finally {
      setArchivingBaselineId(null);
    }
  };

  const sortedBaselines = useMemo(
    () =>
      [...baselines].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [baselines],
  );

  const selectedBaselineName = useMemo(
    () =>
      sortedBaselines.find((baseline) => baseline.id === selectedBaselineId)
        ?.originalFilename ?? null,
    [sortedBaselines, selectedBaselineId],
  );

  useEffect(() => {
    setBaselineName(selectedBaselineName);
  }, [selectedBaselineName]);
  const uploadBaselineFile = async (fileToUpload: File) => {
    if (isUploading) return;
    setError(null);
    setDuplicateErrorDetail(null);
    setUploadStatus(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      const response = await fetch("/api/baselines", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return;
      }

      if (!response.ok) {
        const duplicateDetail = getDuplicateUploadMessage(data);
        if (duplicateDetail) {
          setError("Duplicate resume detected");
          setDuplicateErrorDetail(duplicateDetail);
          return;
        }

        const message = data?.message || data?.error || "Upload failed";
        setError(typeof message === "string" ? message : "Upload failed");
        return;
      }

      const uploadResponse = isBaselineUploadResponse(data)
        ? data
        : { baseline: data as BaselineDto, uploadStatus: null };

      const baselineRecord = uploadResponse.baseline;
      const status =
        uploadResponse.uploadStatus ??
        (({
          isDuplicate: false,
          versionNumber: baselineRecord.version ?? 0,
          message: `Resume uploaded as version ${baselineRecord.version ?? 0}.`,
        } as BaselineUploadStatus));

      setUploadStatus(status);

      setBaselines((previous) => {
        const filtered = previous.filter((entry) => entry.id !== baselineRecord.id);
        return [baselineRecord, ...filtered];
      });

      try {
        await refreshBaselines();
      } catch (refreshError) {
        console.error("Unable to refresh baselines after upload", refreshError);
      }
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      markJourneyStepCompleted("baselines");
    } catch (uploadError) {
      console.error("Upload failed", uploadError);
      setError("Unable to upload resume right now.");
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
      label="RESUME"
      title="Resume"
      titleClassName="text-xl font-semibold tracking-tight text-slate-100"
      description="Upload the resume you trust and keep it ready as your scoring anchor."
      primaryAction={
      <FormButton onClick={triggerUploadClick} disabled={isUploading}>
        {isUploading ? "Uploading..." : "Add resume"}
      </FormButton>
      }
    >
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
        disabled={isUploading}
      />

      {file ? (
        <p className="text-xs text-slate-400">Selected: {file.name}</p>
      ) : null}
      {selectedBaselineName ? (
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
          Selected: {selectedBaselineName}
        </p>
      ) : null}

      {error ? (
        <div style={ttrComponents.dangerBox}>
          <p className="m-0 text-[13px]">{error}</p>
          {duplicateErrorDetail ? (
            <p className="m-0 text-[11px] text-slate-100/80">
              {duplicateErrorDetail}
            </p>
          ) : null}
        </div>
      ) : null}
      {uploadStatus ? (
        <div
          style={{
            ...(uploadStatus.isDuplicate
              ? ttrComponents.warningBox
              : ttrComponents.successBox),
            marginTop: 4,
          }}
        >
          <p className="m-0 text-[13px]">{uploadStatus.message}</p>
        </div>
      ) : null}

      <div className="h-px bg-white/10" />

      {initialFetchError ? (
        <Alert intent="error" title="Unable to load resumes">
          <p className="text-sm text-current">{initialFetchError}</p>
        </Alert>
      ) : null}

      {sortedBaselines.length === 0 ? (
        initialFetchError ? null : (
          <p className="m-0 text-[13px] text-slate-400">
            No resumes uploaded yet.
          </p>
        )
      ) : (
        <div className="space-y-3">
          {sortedBaselines.map((baseline) => {
            const isSelected = baseline.id === selectedBaselineId;
            const cardClasses = [
              "rounded-2xl border border-white/10 bg-slate-950/40 p-4",
              isSelected ? "ring-2 ring-amber-400/40" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={baseline.id} className={cardClasses}>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {baseline.originalFilename}
                    </p>
                    {baseline.status === "ARCHIVED" ? (
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.35em] text-slate-400">
                        Archived
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
                      {isSelected ? "Selected" : "Select"}
                    </FormButton>
                    {baseline.status !== "ARCHIVED" ? (
                      <OverflowMenu
                        onArchive={() => handleArchiveBaseline(baseline.id)}
                        loading={archivingBaselineId === baseline.id}
                        ariaLabel="Resume overflow actions"
                      />
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  Updated {formatDateTime(baseline.updatedAt)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SetupModuleCard>
  );
}
