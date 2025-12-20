"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import { BaselineDto } from "../../lib/baselines";
import { formatDateTime } from "../../lib/format-date";
import { ttrComponents, ttrTypography } from "../ui/ttrStyles";

interface BaselineDashboardProps {
  initialBaselines: BaselineDto[];
}

export function BaselineDashboard({ initialBaselines }: BaselineDashboardProps) {
  const [baselines, setBaselines] = useState<BaselineDto[]>(initialBaselines);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedBaselines = useMemo(
    () =>
      [...baselines].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [baselines],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError("Please choose a PDF or DOCX file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);

    try {
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

      setBaselines((previous) => [data as BaselineDto, ...previous]);
      setFile(null);
    } catch (uploadError) {
      console.error("Upload failed", uploadError);
      setError("Unable to upload baseline right now.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRefresh = async () => {
    setIsUploading(true);
    setError(null);
    try {
      const response = await fetch("/api/baselines", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || "Unable to refresh baselines");
      }

      setBaselines(data as BaselineDto[]);
    } catch (refreshError: any) {
      setError(refreshError?.message || "Unable to refresh baselines");
    } finally {
      setIsUploading(false);
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

  const fileInputStyle: CSSProperties = {
    width: "100%",
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(241,245,249,0.9)",
    fontSize: 13,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ ...ttrComponents.basePanel, padding: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={ttrTypography.subtleLabel}>Upload</p>
          <h2 style={sectionTitleStyle}>Upload baseline</h2>
          <p style={bodyTextStyle}>
            Upload your locked baseline resume as a PDF or DOCX. We will store it securely and
            generate initial sections for tailoring later.
          </p>
        </div>

        <div style={dividerStyle} />

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ ...ttrComponents.fieldLabel, fontSize: 13 }} htmlFor="baselineUpload">
              Baseline file
            </label>
            <input
              id="baselineUpload"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              style={fileInputStyle}
              disabled={isUploading}
            />
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.55)" }}>
              Accepted: PDF, DOCX
              {file ? ` • Selected: ${file.name}` : ""}
            </div>
          </div>

          {error && <div style={ttrComponents.dangerBox}>{error}</div>}

          <button
            type="submit"
            disabled={isUploading}
            onMouseEnter={(e) => {
              if (isUploading) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 18px 30px rgba(249,115,22,0.32)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 15px 25px rgba(249,115,22,0.25)";
            }}
            style={{
              ...ttrComponents.primaryButton,
              width: "fit-content",
              padding: "12px 14px",
              fontSize: 13,
              opacity: isUploading ? 0.7 : 1,
              cursor: isUploading ? "not-allowed" : "pointer",
            }}
          >
            {isUploading ? "Uploading..." : "Upload baseline"}
          </button>
        </form>
      </section>

      <section style={{ ...ttrComponents.basePanel, padding: 18 }}>
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
            <p style={ttrTypography.subtleLabel}>Library</p>
            <h2 style={sectionTitleStyle}>Your baselines</h2>
            <p style={bodyTextStyle}>Latest uploads appear first.</p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isUploading}
            onMouseEnter={(e) => {
              if (isUploading) return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 18px 28px rgba(0,0,0,0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 12px 22px rgba(0,0,0,0.25)";
            }}
            style={{
              ...secondaryButtonStyle,
              opacity: isUploading ? 0.7 : 1,
              cursor: isUploading ? "not-allowed" : "pointer",
            }}
          >
            Refresh
          </button>
        </div>

        <div style={dividerStyle} />

        {sortedBaselines.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
            No baselines uploaded yet.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {sortedBaselines.map((baseline, index) => (
              <li
                key={baseline.id}
                style={{
                  ...listItemStyle,
                  borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
                  <p style={filenameStyle}>{baseline.originalFilename}</p>
                  <p style={metaStyle}>Uploaded {formatDateTime(baseline.createdAt)}</p>
                </div>

                <Link href={`/baseline/${baseline.id}`} style={linkStyle}>
                  View details
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

