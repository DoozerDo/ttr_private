"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { Alert } from "@/components/Alert";
import type { JobDto, JobWarning } from "@/lib/jobs";
import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";
import { markJourneyStepCompleted } from "@/src/lib/journeyNavStore";

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

type IngestionMode = "PASTE" | "URL";

type IngestPreview = {
  rawDescription: string;
  originalRawDescription: string;
  responsibilities: string[];
  requirements: string[];
  warning?: JobWarning | null;
};

type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: string;
  auditId?: string;
};

const createClientError = (message: string, code = "validation_error"): ApiError => ({
  status: 400,
  code,
  message,
});

const buildApiError = (status: number, data: unknown, fallback: string): ApiError => {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const errorNode = (payload.error as Record<string, unknown>) ?? payload;
  const code =
    (errorNode?.code as string | undefined) ||
    (payload.code as string | undefined) ||
    (status === 401 ? "unauthorized" : "unknown_error");
  const message =
    (errorNode?.message as string | undefined) ||
    (payload.message as string | undefined) ||
    fallback;
  const details =
    (errorNode?.details as string | undefined) ||
    (payload.details as string | undefined) ||
    undefined;
  const auditId =
    (payload.audit_id as string | undefined) ||
    (payload.auditId as string | undefined) ||
    (errorNode?.audit_id as string | undefined) ||
    (errorNode?.auditId as string | undefined);

  return {
    status,
    code,
    message,
    details,
    auditId,
  };
};

export type JobIngestionFormProps = {
  onResolved: (jobId: string) => void;
  onCancel: () => void;
};

export function JobIngestionForm({ onResolved, onCancel }: JobIngestionFormProps) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rawDescription, setRawDescription] = useState("");
  const [url, setUrl] = useState("");
  const [ingestionMode, setIngestionMode] = useState<IngestionMode>("PASTE");
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warning, setWarning] = useState<JobWarning | null>(null);
  const [detailsCopied, setDetailsCopied] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);

  const isUrlMode = ingestionMode === "URL";
  const canPreview = isUrlMode ? url.trim().length > 0 : rawDescription.trim().length > 0;
  const canSubmit =
    (isUrlMode ? url.trim().length > 0 : rawDescription.trim().length > 0) &&
    !isSubmitting &&
    !isPreviewing;

  useEffect(() => {
    setDetailsCopied(false);
  }, [error]);

  const resetForm = () => {
    setTitle("");
    setCompany("");
    setRawDescription("");
    setUrl("");
    setPreview(null);
    setIngestionMode("PASTE");
  };

  const requestPreview = async (payload: { url?: string; pastedText?: string }, shouldSet = true) => {
    setIsPreviewing(true);
    setError(null);
    setSuccess(null);
    setWarning(null);
    setDuplicateMessage(null);

    try {
      const response = await fetch("/api/jobs/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return null;
      }

      if (!response.ok) {
        setError(buildApiError(response.status, data, "Unable to parse job description"));
        return null;
      }

      const previewData = (data as IngestPreview) ?? null;
      if (!previewData) {
        setWarning(null);
        return null;
      }
      if (shouldSet) {
        setPreview(previewData);
      }
      setWarning(previewData.warning ?? null);

      return previewData;
    } catch {
      setError(createClientError("Unable to parse job description right now.", "preview_error"));
      return null;
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePreview = async () => {
    if (isUrlMode) {
      if (!url.trim()) {
        setError(
          createClientError("Please add a job description URL before previewing.", "preview_validation"),
        );
        return;
      }
      await requestPreview({ url: url.trim() });
      return;
    }

    if (!rawDescription.trim()) {
      setError(
        createClientError("Please paste a job description before previewing.", "preview_validation"),
      );
      return;
    }

    await requestPreview({ pastedText: rawDescription });
  };

  const handleModeChange = (mode: IngestionMode) => {
    setIngestionMode(mode);
    setPreview(null);
    setError(null);
    setSuccess(null);
    setWarning(null);
    setDuplicateMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setWarning(null);

    let previewPayload = preview;
    const trimmedUrl = url.trim();

    if (isUrlMode) {
      if (!trimmedUrl) {
        setError(createClientError("Please add a job description URL before saving.", "submit_validation"));
        return;
      }
      if (!previewPayload) {
        previewPayload = await requestPreview({ url: trimmedUrl }, false);
        if (!previewPayload) {
          return;
        }
      }
    } else if (!rawDescription.trim()) {
      setError(createClientError("Please paste a job description before saving.", "submit_validation"));
      return;
    }

    const finalRawDescription =
      previewPayload?.originalRawDescription ?? previewPayload?.rawDescription ?? rawDescription;

    if (!finalRawDescription?.trim()) {
      setError(createClientError("Please provide a job description before saving.", "submit_validation"));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          company,
          rawDescription: finalRawDescription,
          sourceUrl: isUrlMode ? trimmedUrl : null,
          responsibilities: previewPayload?.responsibilities,
          requirements: previewPayload?.requirements,
          jdIngestionMethod: ingestionMode,
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.href = "/auth/login";
        return;
      }

      if (response.status === 409) {
        setDuplicateMessage("This file has already been uploaded.");
        return;
      }

      if (!response.ok) {
        setError(buildApiError(response.status, data, "Unable to save job"));
        return;
      }

      const jobData = data as JobDto;
      setWarning(jobData.warning ?? null);
      resetForm();
      setSuccess("Job description saved. Ready to analyze fit.");
      markJourneyStepCompleted("jobs");
      onResolved(jobData.id);
    } catch {
      setError(createClientError("Unable to save job right now.", "submit_error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorDetailsText = error
    ?
        JSON.stringify(
          {
            status: error.status,
            code: error.code,
            message: error.message,
            details: error.details,
            auditId: error.auditId,
          },
          null,
          2,
        ) ?? ""
    :
        "";
  const hasClipboardAPI =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
  const copyErrorDetails = async () => {
    if (!hasClipboardAPI || !errorDetailsText) return;
    try {
      await navigator.clipboard.writeText(errorDetailsText);
    } catch {
      //
    } finally {
      setDetailsCopied(true);
    }
  };

  return (
    <section style={{ ...ttrComponents.basePanel, padding: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <span style={ttrTypography.subtleLabel}>Job intake</span>
        <h2 style={ttrTypography.h2}>Capture the posting</h2>
        <p style={ttrTypography.bodyMuted}>
          Paste the full job description or fetch it from a URL. Title and company are optional
          but helpful for organization later.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(["PASTE", "URL"] as const).map((mode) => (
            <label
              key={mode}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: ingestionMode === mode ? "rgba(248,250,252,0.95)" : "rgba(148,163,184,0.7)",
              }}
            >
              <input
                type="radio"
                name="ingestionMode"
                value={mode}
                checked={ingestionMode === mode}
                onChange={() => handleModeChange(mode)}
                disabled={isSubmitting || isPreviewing}
              />
              {mode === "PASTE" ? "Paste" : "URL"}
            </label>
          ))}
        </div>

        <div style={fieldStyle}>
          <label style={ttrComponents.fieldLabel} htmlFor="jobTitle">
            Job title (optional)
          </label>
          <input
            id="jobTitle"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Senior Product Designer"
            style={ttrComponents.textInput}
            disabled={isSubmitting}
          />
        </div>

        <div style={fieldStyle}>
          <label style={ttrComponents.fieldLabel} htmlFor="jobCompany">
            Company (optional)
          </label>
          <input
            id="jobCompany"
            type="text"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="Acme Health"
            style={ttrComponents.textInput}
            disabled={isSubmitting}
          />
        </div>

        {isUrlMode ? (
          <div style={fieldStyle}>
            <label style={ttrComponents.fieldLabel} htmlFor="jobUrl">
              Job description URL
            </label>
            <input
              id="jobUrl"
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setPreview(null);
              }}
              placeholder="https://company.com/jobs/role"
              style={ttrComponents.textInput}
              disabled={isSubmitting || isPreviewing}
            />
          </div>
        ) : (
          <div style={fieldStyle}>
            <label style={ttrComponents.fieldLabel} htmlFor="jobDescription">
              Job description
            </label>
            <textarea
              id="jobDescription"
              value={rawDescription}
              onChange={(event) => {
                setRawDescription(event.target.value);
                setPreview(null);
              }}
              placeholder="Paste the full role description, requirements, and responsibilities."
              style={{ ...ttrComponents.textArea, minHeight: 220 }}
              disabled={isSubmitting || isPreviewing}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handlePreview}
          disabled={isSubmitting || isPreviewing || !canPreview}
          style={{
            ...ttrComponents.secondaryButton,
            width: "fit-content",
            padding: "10px 14px",
            fontSize: 12,
            opacity: isSubmitting || isPreviewing || !canPreview ? 0.7 : 1,
            cursor: isSubmitting || isPreviewing || !canPreview ? "not-allowed" : "pointer",
          }}
        >
          {isPreviewing
            ? "Parsing..."
            : isUrlMode
              ? "Fetch & preview"
              : "Preview parse"}
        </button>

        {error && (
          <Alert intent="error" title={`Job ingestion issue`}>
            <p style={{ margin: 0 }}>{error.message}</p>
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 12,
                marginTop: 6,
                color: "rgba(226,232,240,0.8)",
              }}
            >
              <span>Status: {error.status}</span>
              <span>Code: {error.code}</span>
              {error.auditId && <span>Audit ID: {error.auditId}</span>}
            </div>
            <details
              style={{
                marginTop: 8,
                cursor: "pointer",
                fontSize: 12,
                color: "rgba(226,232,240,0.7)",
              }}
            >
              <summary>Copy details</summary>
              <pre
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  backgroundColor: "rgba(15,23,42,0.6)",
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {errorDetailsText}
              </pre>
              {hasClipboardAPI && (
                <button
                  type="button"
                  className="mt-2"
                  onClick={copyErrorDetails}
                  style={{
                    ...ttrComponents.secondaryButton,
                    padding: "6px 10px",
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  {detailsCopied ? "Copied" : "Copy details"}
                </button>
              )}
            </details>
          </Alert>
        )}
        {duplicateMessage ? (
          <p style={{ margin: 0, fontSize: 13, color: "rgba(203,213,225,0.9)" }}>
            {duplicateMessage}
          </p>
        ) : null}
        {warning && (
          <Alert intent="warning" title="Partial parsing">
            <p style={{ margin: 0 }}>{warning.message}</p>
            {warning.details ? (
              <details
                style={{
                  marginTop: 8,
                  cursor: "pointer",
                  fontSize: 12,
                  color: "rgba(226,232,240,0.7)",
                }}
              >
                <summary>Details</summary>
                <pre
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    whiteSpace: "pre-wrap",
                    backgroundColor: "rgba(15,23,42,0.6)",
                    padding: 8,
                    borderRadius: 6,
                  }}
                >
                  {warning.details}
                </pre>
              </details>
            ) : null}
          </Alert>
        )}
        {success && <div style={ttrComponents.successBox}>{success}</div>}

        {preview && (
          <div style={{ ...ttrComponents.basePanel, padding: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 style={{ ...ttrTypography.h3, margin: 0 }}>Parsed preview</h3>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "rgba(226,232,240,0.8)" }}>
                  View extracted description
                </summary>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "rgba(226,232,240,0.75)" }}>
                  {preview.rawDescription}
                </p>
              </details>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600 }}>
                    Responsibilities
                  </p>
                  {preview.responsibilities.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                      No responsibilities detected yet.
                    </p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                      {preview.responsibilities.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600 }}>
                    Requirements
                  </p>
                  {preview.requirements.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                      No requirements detected yet.
                    </p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                      {preview.requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              ...ttrComponents.secondaryButton,
              width: "fit-content",
              padding: "10px 14px",
              fontSize: 12,
            }}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...ttrComponents.primaryButton,
              width: "fit-content",
              padding: "12px 14px",
              fontSize: 13,
              opacity: !canSubmit ? 0.7 : 1,
              cursor: !canSubmit ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Saving..." : "Save job description"}
          </button>
        </div>
      </form>
    </section>
  );
}
