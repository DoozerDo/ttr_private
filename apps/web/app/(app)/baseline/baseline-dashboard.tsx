"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { CSSProperties, FormEvent } from "react";
import { useMemo, useRef, useState } from "react";

import { Alert } from "@/components/Alert";
import {
  archiveBaseline,
  BaselineDto,
  BaselineUploadResponse,
  BaselineUploadStatus,
  listBaselines,
  restoreBaseline,
} from "@/lib/baselines";
import { markJourneyStepCompleted } from "@/src/lib/journeyNavStore";
import { formatDateTime } from "@/lib/format-date";
import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";
import { getBaselineDetailsHref } from "@/src/navigation/routes";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const sortedBaselines = useMemo(
    () =>
      [...baselines].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [baselines],
  );
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
        ({
          isDuplicate: false,
          versionNumber: baselineRecord.version ?? 0,
          message: `Baseline uploaded as version ${baselineRecord.version ?? 0}.`,
        } as BaselineUploadStatus);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError("Please choose a PDF or DOCX file to upload.");
      return;
    }

    await uploadBaselineFile(file);
  };

  const handleRefresh = async () => {
    setError(null);
    setIsRefreshing(true);

    try {
      await refreshBaselines();
    } catch (refreshError: any) {
      setError(refreshError?.message || "Unable to refresh baselines");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBaselineStatusUpdate = async (baseline: BaselineDto) => {
    setError(null);
    setIsRefreshing(true);

    try {
      if (baseline.status === "ACTIVE") {
        await archiveBaseline(baseline.id);
      } else {
        await restoreBaseline(baseline.id);
      }
      await refreshBaselines();
    } catch (statusError: any) {
      setError(statusError?.message || "Unable to update baseline status");
    } finally {
      setIsRefreshing(false);
    }
  };

  const sectionTitleStyle: CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#f8fafc",
  };

  const bodyTextStyle: CSSProperties = {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: "rgba(226,232,240,0.75)",
  };

  const dividerStyle: CSSProperties = {
    height: 1,
    background: "rgba(255,255,255,0.06)",
    margin: "14px 0",
  };

  const hiddenFileInputStyle: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    border: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
  };

  const uploadButtonWrapperStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
  };

  const fileInfoStyle: CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: "rgba(226,232,240,0.65)",
  };

  const secondaryButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 12px",
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

  const statusActionButtonStyle: CSSProperties = {
    ...secondaryButtonStyle,
    padding: "6px 10px",
    fontSize: 12,
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section
        style={{
          ...ttrComponents.basePanel,
          padding: 18,
          flex: "0 0 auto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={ttrTypography.subtleLabel}>Upload</p>
          <h2 style={sectionTitleStyle}>Upload baseline</h2>
          <p style={bodyTextStyle}>
            Upload your resume as a PDF or DOCX. We will store it securely and
            ingest its content for future tailoring.
          </p>
        </div>

        <div style={dividerStyle} />

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label
              style={{ ...ttrComponents.fieldLabel, fontSize: 13 }}
              htmlFor="baselineUpload"
            >
              Baseline file
            </label>
            <div style={uploadButtonWrapperStyle}>
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
                style={hiddenFileInputStyle}
                disabled={isUploading}
              />
              <button
                type="submit"
                disabled={!uploadButtonEnabled}
                onMouseEnter={(e) => {
                  if (!uploadButtonEnabled) return;
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 18px 30px rgba(249,115,22,0.32)";
                }}
                onMouseLeave={(e) => {
                  if (!uploadButtonEnabled) return;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 15px 25px rgba(249,115,22,0.25)";
                }}
                style={{
                  ...ttrComponents.primaryButton,
                  width: "fit-content",
                  padding: "12px 14px",
                  fontSize: 13,
                  opacity: uploadButtonEnabled ? 1 : 0.7,
                  cursor: uploadButtonEnabled ? "pointer" : "not-allowed",
                }}
              >
                {isUploading ? "Uploading..." : "Upload baseline"}
              </button>
              <label
                htmlFor="baselineUpload"
                aria-label="Choose baseline file"
                tabIndex={canOpenFilePicker ? 0 : -1}
                onKeyDown={(event) => {
                  if (!canOpenFilePicker) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 12,
                  cursor: canOpenFilePicker ? "pointer" : "default",
                  pointerEvents: canOpenFilePicker ? "auto" : "none",
                }}
              />
            </div>
            {file ? (
              <p style={fileInfoStyle}>Selected: {file.name}</p>
            ) : null}
          </div>

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

        </form>
      </section>

      <section
        style={{
          ...ttrComponents.basePanel,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={ttrTypography.subtleLabel}>BASELINES</p>
              <h2 style={sectionTitleStyle}>Baselines</h2>
              <p style={bodyTextStyle}>
                Upload and manage your baseline resumes. These are your source of truth for scoring
                and tailoring.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isUploading || isRefreshing}
                onMouseEnter={(e) => {
                  if (isUploading || isRefreshing) return;
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 18px 28px rgba(0,0,0,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 12px 22px rgba(0,0,0,0.25)";
                }}
                style={{
                  ...secondaryButtonStyle,
                  opacity: isUploading || isRefreshing ? 0.7 : 1,
                  cursor:
                    isUploading || isRefreshing ? "not-allowed" : "pointer",
                }}
              >
                Refresh
              </button>
            </div>
          </div>

        {initialFetchError ? (
          <Alert intent="error" title="Unable to load baselines">
            <p className="text-sm text-current">{initialFetchError}</p>
          </Alert>
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "hidden",
          }}
        >
          <div style={dividerStyle} />
          <div
            style={{
              overflowY: "auto",
              maxHeight: "60vh",
            }}
          >
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
                      index === 0
                        ? "none"
                        : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      minWidth: 220,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <p style={filenameStyle}>{baseline.originalFilename}</p>
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
                    <button
                      type="button"
                      onClick={() => handleBaselineStatusUpdate(baseline)}
                      disabled={isUploading || isRefreshing}
                      style={{
                        ...statusActionButtonStyle,
                        opacity: isUploading || isRefreshing ? 0.6 : 1,
                        cursor:
                          isUploading || isRefreshing
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {baseline.status === "ACTIVE" ? "Archive" : "Restore"}
                    </button>
                  </div>
                </li>
              );
            })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

