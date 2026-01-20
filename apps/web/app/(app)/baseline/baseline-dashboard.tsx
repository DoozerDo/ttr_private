"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import {
  BaselineDto,
  BaselineUploadResponse,
  BaselineUploadStatus,
  archiveBaseline,
  listBaselines,
} from "@/lib/baselines";
import { markJourneyStepCompleted } from "@/src/lib/journeyNavStore";
import { formatDateTime } from "@/lib/format-date";
import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";
import { getBaselineDetailsHref } from "@/src/navigation/routes";
import { InputCard } from "./_components/InputCard";
import { OverflowMenu } from "./_components/OverflowMenu";
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
    () => sortedBaselines.find((baseline) => baseline.id === selectedBaselineId)?.originalFilename ?? null,
    [sortedBaselines, selectedBaselineId],
  );

  useEffect(() => {
    setBaselineName(selectedBaselineName);
  }, [selectedBaselineName]);
  const uploadButtonEnabled = Boolean(file) && !isUploading;
  const canOpenFilePicker = !file && !isUploading;

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

  const dividerStyle: CSSProperties = {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "14px 0",
  };

  const fileInfoStyle: CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: "rgba(226,232,240,0.65)",
  };

  const statusActionButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(241,245,249,0.92)",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 12px 22px rgba(0,0,0,0.25)",
    transition: "transform 160ms ease, box-shadow 160ms ease",
    userSelect: "none",
  };

  const archivedBadgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.05)",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "rgba(226,232,240,0.75)",
  };

  const listItemStyle: CSSProperties = {
    padding: "12px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  };

  const filenameStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "rgba(248,250,252,0.95)",
  };

  const metaStyle: CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: "rgba(226,232,240,0.6)",
  };

  const linkStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    color: "rgba(251,191,36,0.95)",
    textDecoration: "none",
    border: "1px solid rgba(251,191,36,0.28)",
    background: "rgba(251,191,36,0.08)",
    padding: "8px 10px",
    borderRadius: 12,
    whiteSpace: "nowrap",
  };

  return (
    <InputCard
      kicker="BASELINE"
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
        <p style={{ margin: 0 }}>
          Upload a PDF or DOCX, and we’ll keep it securely stored for future scoring.
        </p>
        {file ? <p style={fileInfoStyle}>Selected: {file.name}</p> : null}
      </div>

      {selectedBaselineName ? (
        <p className="text-xs text-slate-400">Selected: {selectedBaselineName}</p>
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
          <p style={{ margin: 0, fontSize: 13 }}>{uploadStatus.message}</p>
        </div>
      ) : null}

      <div style={dividerStyle} />

      {initialFetchError ? (
        <Alert intent="error" title="Unable to load baselines">
          <p className="text-sm text-current">{initialFetchError}</p>
        </Alert>
      ) : null}

      {sortedBaselines.length === 0 ? (
        initialFetchError ? null : (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "rgba(226,232,240,0.7)",
            }}
          >
            No baselines uploaded yet.
          </p>
        )
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {sortedBaselines.map((baseline, index) => {
            const isSelected = baseline.id === selectedBaselineId;

            return (
              <li
                key={baseline.id}
                style={{
                  ...listItemStyle,
                  borderTop:
                    index === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <p style={filenameStyle} className="truncate">
                      {baseline.originalFilename}
                    </p>
                    {baseline.status === "ARCHIVED" ? (
                      <span style={archivedBadgeStyle}>Archived</span>
                    ) : null}
                  </div>
                  <p style={metaStyle}>
                    Uploaded {formatDateTime(baseline.createdAt)}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Link
                    href={getBaselineDetailsHref(baseline.id)}
                    style={linkStyle}
                  >
                    View details
                  </Link>
                  <button
                    type="button"
                    onClick={() => setBaselineSelection(baseline.id)}
                    disabled={isSelected}
                    style={{
                      ...statusActionButtonStyle,
                      opacity: isSelected ? 0.6 : 1,
                      cursor: isSelected ? "not-allowed" : "pointer",
                      minWidth: 90,
                    }}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </button>
                  {baseline.status !== "ARCHIVED" ? (
                    <OverflowMenu
                      onArchive={() => handleArchiveBaseline(baseline.id)}
                      loading={archivingBaselineId === baseline.id}
                      ariaLabel="Baseline overflow actions"
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </InputCard>
  );
}
