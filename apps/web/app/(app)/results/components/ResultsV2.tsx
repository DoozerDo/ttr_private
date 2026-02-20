"use client";

import type React from "react";
import { ScoreGauge } from "@/components/ScoreGauge";
import { PageHeader } from "@/components/PageHeader";
import { humanizeConfidenceReason } from "@/lib/confidence";
import type { ParsedComplianceError } from "@/lib/compliance/parseComplianceError";

type ResultsV2Props = {
  heroHeading: string;
  heroScoreText: string;
  heroSupportText: string | null;
  activeScore: number | null;
  isLowScore: boolean;
  executionMode: boolean;
  levelLabel: string;
  strengths: string[];
  gaps: string[];
  complianceError: ParsedComplianceError | null;
  complianceFlags?: string[] | null;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  primaryActionDisabled?: boolean;
  delta?: number | null;
  confidenceScore?: number | null;
  confidenceReasons?: string[] | null;
};

const sectionCardStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--card-radius)",
  padding: "var(--space-md)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "var(--text-section-title)",
  marginBottom: "var(--space-sm)",
  color: "var(--text-primary)",
  fontWeight: 700,
};

const sectionListStyle: React.CSSProperties = {
  listStyleType: "disc",
  paddingLeft: "var(--space-lg)",
  margin: 0,
  fontSize: "var(--text-body)",
  color: "var(--text-secondary)",
};

const heroCardStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-surface)",
  borderRadius: "calc(var(--card-radius) + 4px)",
  border: "1px solid var(--border-strong)",
  padding: "calc(var(--space-lg))",
};

const heroColumnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-sm)",
  color: "var(--text-primary)",
};

function buildComplianceSummary(
  complianceError: ParsedComplianceError | null,
  complianceFlags?: string[] | null,
): string[] {
  const items: string[] = [];
  if (complianceError?.type === "insufficient_extracted_text") {
    const details = complianceError.details;
    items.push(
      `Insufficient extracted resume text. Extracted ${details.extractedChars.toLocaleString()} characters. Minimum is ${details.minChars.toLocaleString()}.`,
    );
  } else if (complianceError?.type === "COMPLIANCE_VIOLATION") {
    for (const violation of complianceError.violations) {
      if (violation.message) {
        items.push(violation.message);
      } else if (violation.code) {
        items.push(violation.code);
      }
    }
  }
  if (Array.isArray(complianceFlags) && complianceFlags.length) {
    items.push(...complianceFlags.slice(0, 3));
  }
  if (!items.length) {
    items.push("No compliance concerns detected.");
  }
  return items.slice(0, 3);
}

function buildSectionItems(values: string[], fallback: string) {
  if (!values.length) {
    return [fallback];
  }
  return values.slice(0, 3);
}

export function ResultsV2({
  heroHeading,
  heroScoreText,
  heroSupportText,
  activeScore,
  isLowScore,
  levelLabel,
  strengths,
  gaps,
  complianceError,
  complianceFlags,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled,
  delta,
  confidenceScore,
  confidenceReasons,
}: ResultsV2Props) {
  const showDelta = typeof delta === "number";
  const deltaLabel = showDelta
    ? `${delta >= 0 ? "▲" : "▼"} ${delta >= 0 ? `+${delta}` : delta.toString()}`
    : null;
  const deltaColor = delta && delta > 0 ? "var(--delta-positive)" : "var(--delta-negative)";

  const normalizedConfidenceReasons = (confidenceReasons ?? []).filter(Boolean);
  const humanizedConfidenceReasons = normalizedConfidenceReasons.map((reason) =>
    humanizeConfidenceReason(reason),
  );
  const showConfidence = typeof confidenceScore === "number";

  const whatImproved = buildSectionItems(strengths, "Strengths will appear here once the analysis completes.");
  const leverageGaps = buildSectionItems(gaps, "Highest leverage gaps will surface after analysis.");
  const complianceItems = buildComplianceSummary(complianceError, complianceFlags);

  return (
    <div
      style={{
        backgroundColor: "var(--bg-app)",
        color: "var(--text-primary)",
        padding: "var(--space-xl)",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <PageHeader
          title="Results"
          description="Review your score and the reasons behind it and then advance to your personalized document creation."
        />

        <section style={heroCardStyle}>
          <div
            className="grid gap-8 lg:grid-cols-[1.4fr,0.6fr] lg:items-center"
            style={{}}
          >
            <div style={heroColumnStyle}>
              <div
                style={{
                  fontSize: "var(--text-hero-size)",
                  fontWeight: 600,
                  color: showDelta ? deltaColor : "var(--text-primary)",
                }}
              >
                {showDelta ? deltaLabel : "Baseline Established"}
              </div>
              <div
                style={{
                  fontSize: "var(--text-score-size)",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {showDelta ? `New Score: ${heroScoreText.replace("Score: ", "")}` : `Initial Score: ${heroScoreText.replace("Score: ", "")}`}
              </div>
              <div
                style={{
                  fontSize: "18px",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                }}
              >
                Alignment Level {levelLabel}
              </div>
              {heroSupportText ? (
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--text-body)" }}>
                  {heroSupportText}
                </p>
              ) : null}
              {showConfidence ? (
                <div style={{ marginTop: 4 }}>
                  <p style={{ margin: 0, color: "var(--text-slate-400)", fontSize: "12px", letterSpacing: "0.3em", textTransform: "uppercase" }}>
                    Confidence
                  </p>
                  <p style={{ margin: 0, color: "var(--text-slate-200)", fontSize: "14px", fontWeight: 600 }}>
                    Confidence: {confidenceScore}%
                  </p>
                  {humanizedConfidenceReasons.length ? (
                    <details className="text-xs text-slate-400" style={{ marginTop: 4 }}>
                      <summary className="cursor-pointer" style={{ letterSpacing: "0.3em", textTransform: "uppercase", fontWeight: 600 }}>
                        Confidence reasons
                      </summary>
                      <ul className="mt-2 space-y-1" style={{ listStyle: "disc", marginLeft: "1rem", paddingLeft: 0 }}>
                        {humanizedConfidenceReasons.map((reason) => (
                          <li key={reason} className="text-xs text-slate-300">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ScoreGauge score={activeScore ?? undefined} loading={activeScore === null} label="Current score" />
            </div>
          </div>
        </section>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-lg)",
          }}
        >
          {[{
              title: "What improved",
              items: whatImproved,
            },
            {
              title: "Highest leverage gap",
              items: leverageGaps,
            },
            {
              title: "Compliance status",
              items: complianceItems,
            },
          ].map((section) => (
            <section key={section.title} style={sectionCardStyle}>
              <div style={sectionTitleStyle}>{section.title}</div>
              <ul style={sectionListStyle}>
                {section.items.map((item, index) => (
                  <li key={`${section.title}-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          style={{
            marginTop: "var(--space-lg)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            className="results-v2-primary-cta"
            onClick={onPrimaryAction}
            disabled={primaryActionDisabled}
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "var(--verdict-apply-text)",
              border: "none",
              borderRadius: "var(--button-radius)",
              padding: "calc(var(--space-sm) + var(--space-md)) calc(var(--space-lg) + var(--space-sm))",
              cursor: primaryActionDisabled ? "not-allowed" : "pointer",
              opacity: primaryActionDisabled ? 0.6 : 1,
            }}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
