"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

export function BaselineDashboard({
  initialBaselines,
  initialFetchError,
  selectedBaselineId,
}: BaselineDashboardProps) {
  const [baselines, setBaselines] = useState<BaselineDto[]>(initialBaselines);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          message: `Baseline uploaded as version ${baselineRecord.version ?? 0}.`,
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
      setError("Unable to upload baseline right now.");
    } finally {
      setIsUploading(false);
    }
  };

  const triggerUploadClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  return (
    <SetupModuleCard
      label="BASELINE"
      title="Baseline"
      description="Upload the resume you trust and keep it ready as your scoring anchor."
      primaryAction={
        <FormButton onClick={triggerUploadClick} disabled={isUploading}>
          {isUploading ? "Uploading..." : "Add baseline"}
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

      <div className="space-y-3 text-sm text-slate-300">
        <p className="m-0">
          Upload a PDF or DOCX, and weƒ?Tll keep it securely stored for future scoring.
        </p>
        {file ? (
          <p className="text-xs text-slate-400">Selected: {file.name}</p>
        ) : null}
      </div>

      {selectedBaselineName ? (
        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
          Selected: {selectedBaselineName}
        </p>
      ) : null}

      {error ? <div style={ttrComponents.dangerBox}>{error}</div> : null}
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
        <Alert intent="error" title="Unable to load baselines">
          <p className="text-sm text-current">{initialFetchError}</p>
        </Alert>
      ) : null}

      {sortedBaselines.length === 0 ? (
        initialFetchError ? null : (
          <p className="m-0 text-[13px] text-slate-400">
            No baselines uploaded yet.
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
                <div className="flex items-center justify-between gap-4 min-w-0">
                  <div className="flex flex-1 min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {baseline.originalFilename}
                    </p>
                    {baseline.status === "ARCHIVED" ? (
                      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.35em] text-slate-400">
                        Archived
                      </span>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
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
                        ariaLabel="Baseline overflow actions"
                      />
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Uploaded {formatDateTime(baseline.createdAt)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SetupModuleCard>
  );
}
