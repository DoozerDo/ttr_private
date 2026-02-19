import type { CSSProperties } from "react";

import { ttrComponents, ttrTypography } from "@/app/(app)/ui/ttrStyles";
import type {
  ParsedInsufficientExtractedTextError,
} from "@/lib/compliance/parseComplianceError";

type Props = {
  error: ParsedInsufficientExtractedTextError;
};

const DEFAULT_STEP_COPY: Record<ParsedInsufficientExtractedTextError["details"]["reason"], string[]> = {
  likely_extraction_failure: [
    "Export to a text-based PDF from Word or Google Docs instead of a scanned PDF.",
    "If the PDF is scanned, run OCR and re-export so the text is machine readable.",
    "Upload the original DOCX file if it exists, or re-export the PDF after OCR.",
  ],
  resume_too_short: [
    "Add missing sections such as Experience, Skills, and Education to cover your full story.",
    "Ensure each section contains full bullet content rather than only headings or labels.",
  ],
};

const summaryStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "rgba(241,245,249,0.92)",
};

export function InsufficientExtractedText({ error }: Props) {
  const { details } = error;
  const steps = details.tips.length ? details.tips : DEFAULT_STEP_COPY[details.reason];
  const reasonCopy =
    details.reason === "likely_extraction_failure"
      ? "Extraction likely failed or the file is not machine readable."
      : "The uploaded resume appears unusually short.";

  return (
    <div
      style={{
        ...ttrComponents.warningBox,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16 }}>
        We could not extract enough text from that resume
      </div>

      <p style={summaryStyle}>
        We extracted {details.extractedChars.toLocaleString()} of the required{" "}
        {details.minChars.toLocaleString()} characters.
      </p>

      <p style={summaryStyle}>{reasonCopy}</p>

      <div>
        <p
          style={{
            margin: "0 0 4px 0",
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(241,245,249,0.9)",
          }}
        >
          Steps to try
        </p>
        <ol
          style={{
            margin: 0,
            paddingLeft: 18,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 13,
            color: "rgba(241,245,249,0.92)",
          }}
        >
          {steps.map((step, index) => (
            <li key={`${details.reason}-${index}`}>{step}</li>
          ))}
        </ol>
      </div>

      <details
        style={{
          borderRadius: 8,
          backgroundColor: "rgba(15,23,42,0.7)",
          padding: "10px 12px",
          color: "rgba(226,232,240,0.8)",
          fontSize: 13,
        }}
      >
        <summary
          style={{ cursor: "pointer", outline: "none", fontWeight: 600 }}
        >
          Preview extracted text
        </summary>
        <pre
          style={{
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            margin: "8px 0 0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "rgba(226,232,240,0.9)",
          }}
        >
          {details.preview || "Preview unavailable."}
        </pre>
      </details>
    </div>
  );
}
