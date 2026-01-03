"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";

type FitDimensionScores = {
  experienceAlignment?: number;
  leadershipLevel?: number;
  technicalPlatformFit?: number;
  industryContext?: number;
  strategicTacticalFit?: number;
};

type FitAssessment = {
  jobId?: string;
  baselineId?: string;
  overallScore?: number;
  score?: number;
  summary?: string;
  dimensionScores?: FitDimensionScores;
  breakdown?: {
    experience_alignment?: number;
    leadership_level?: number;
    technical_platform_fit?: number;
    industry_context?: number;
    strategic_vs_tactical?: number;
  };
  strengths?: string[];
  gaps?: string[];
  complianceFlags?: string[] | Array<{ code?: string; message?: string }>;
  compliance_flags?: Array<{ code?: string; message?: string }>;
};

const DIMENSION_LABELS: Record<keyof Required<FitDimensionScores>, string> = {
  experienceAlignment: "Experience alignment",
  leadershipLevel: "Leadership level",
  technicalPlatformFit: "Technical platform fit",
  industryContext: "Industry & context",
  strategicTacticalFit: "Strategic vs tactical",
};

function normalizeDimensions(data?: FitAssessment | null): FitDimensionScores {
  if (!data) return {};

  if (data.dimensionScores) {
    return data.dimensionScores;
  }

  if (data.breakdown) {
    const breakdown = data.breakdown;
    return {
      experienceAlignment: breakdown.experience_alignment,
      leadershipLevel: breakdown.leadership_level,
      technicalPlatformFit: breakdown.technical_platform_fit,
      industryContext: breakdown.industry_context,
      strategicTacticalFit: breakdown.strategic_vs_tactical,
    };
  }

  return {};
}

function normalizeComplianceFlags(flags?: FitAssessment["complianceFlags"]): string[] {
  if (!flags) return [];
  if (Array.isArray(flags) && typeof flags[0] === "string") return flags as string[];

  if (Array.isArray(flags)) {
    return (flags as Array<{ code?: string; message?: string }>)
      .map((flag) => flag?.code || flag?.message)
      .filter((item): item is string => Boolean(item));
  }

  return [];
}

const ScoreRing = ({ score, loading }: { score: number; loading: boolean }) => {
  const radius = 72;
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const offset = circumference * (1 - clampedScore / 100);
  const gradientId = "fitReviewScoreRingGradient";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        height: 176,
        width: 176,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 200 200" style={{ height: "100%", width: "100%" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={14}
          fill="none"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={14}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 800ms ease-out",
            filter: "drop-shadow(0 0 18px rgba(34,197,94,0.2))",
          }}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "#bbf7d0",
            textShadow: "0 2px 14px rgba(0,0,0,0.35)",
          }}
        >
          {Math.round(clampedScore)}
        </div>
        <span
          style={{
            marginTop: 6,
            fontSize: 11,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: "rgba(187,247,208,0.8)",
          }}
        >
          Fit score
        </span>
      </div>
    </div>
  );
};

export default function FitReviewClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId") ?? "";

  const [assessment, setAssessment] = useState<FitAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startedInterviewId, setStartedInterviewId] = useState<string | null>(null);

  const dimensionScores = normalizeDimensions(assessment);
  const complianceFlags = normalizeComplianceFlags(
    assessment?.complianceFlags ?? assessment?.compliance_flags,
  );
  const fitScore =
    assessment?.overallScore ??
    assessment?.score ??
    (typeof assessment?.overallScore === "number" ? assessment.overallScore : 0);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setAssessment(null);

      try {
        const response = await fetch(`/api/analysis/job/${encodeURIComponent(jobId)}/latest`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Unable to load fit review data.");
        }

        const data = (await response.json()) as FitAssessment;
        if (!cancelled) {
          setAssessment(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : "Unable to load fit review data.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const handleStartInterview = async () => {
    if (!assessment?.jobId || !assessment?.baselineId) {
      setStartError("Missing job or baseline context for this assessment.");
      return;
    }

    setStarting(true);
    setStartError(null);

    try {
      const response = await fetch("/api/interviews/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: assessment.jobId,
          baselineId: assessment.baselineId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error || payload?.message || "Unable to start an interview.";
        throw new Error(typeof message === "string" ? message : "Unable to start an interview.");
      }

      const data = (await response.json()) as { id?: string };
      const interviewId = data?.id;

      if (interviewId) {
        setStartedInterviewId(interviewId);
        router.push(`/interviews/${interviewId}`);
      } else {
        setStartedInterviewId(null);
      }
    } catch (startIssue) {
      const message =
        startIssue instanceof Error ? startIssue.message : "Unable to start an interview.";
      setStartError(message);
    } finally {
      setStarting(false);
    }
  };

  const dimensionEntries = Object.entries(DIMENSION_LABELS).map(([key, label]) => {
    const value = dimensionScores[key as keyof FitDimensionScores] ?? null;
    return { key, label, value };
  });

  return (
    <InstrumentShell
      kicker="Fit Review"
      title="Role alignment review"
      subtitle="See how your baseline maps to the role and kick off an interview session."
      rightSlot={
        jobId ? (
          <span style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>Job: {jobId}</span>
        ) : null
      }
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...ttrComponents.basePanel, flex: 0.95, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 15% 0%, rgba(34,197,94,0.08), transparent 32%), radial-gradient(circle at 90% 16%, rgba(251,191,36,0.06), transparent 30%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <ScoreRing score={fitScore ?? 0} loading={loading} />

            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 240 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={ttrTypography.subtleLabel}>Overview</span>
                <h2 style={ttrTypography.h2}>Fit summary</h2>
              </div>

              <p style={{ margin: 0, color: "rgba(241,245,249,0.92)", fontSize: 15 }}>
                {assessment?.summary || "View the latest compatibility score and signals for this role."}
              </p>

              {assessment?.baselineId ? (
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Baseline: {assessment.baselineId}
                </div>
              ) : null}

              {error ? <div style={ttrComponents.dangerBox}>{error}</div> : null}
              {!error && !loading && !assessment ? (
                <div style={ttrComponents.warningBox}>Run an analysis first to view Fit Review.</div>
              ) : null}
            </div>
          </div>
        </section>

        <section style={{ ...ttrComponents.basePanel, flex: 0.9 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Action</span>
            <h2 style={ttrTypography.h2}>Next steps</h2>
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, color: "rgba(226,232,240,0.8)", fontSize: 14 }}>
              Ready to move forward? Start a structured interview session tied to this role.
            </p>

            <button
              type="button"
              onClick={handleStartInterview}
              disabled={starting || !assessment?.jobId || !assessment?.baselineId}
              style={{
                ...ttrComponents.primaryButton,
                cursor: starting ? "not-allowed" : "pointer",
                opacity: starting ? 0.7 : 1,
              }}
            >
              {starting ? "Starting..." : "I think I'm qualified"}
            </button>

            {startError ? <div style={ttrComponents.dangerBox}>{startError}</div> : null}

            {startedInterviewId ? (
              <div style={ttrComponents.successBox}>
                Interview created.{" "}
                <Link href={`/interviews/${startedInterviewId}`} style={{ color: "#c084fc", textDecoration: "underline" }}>
                  Open interview
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div style={ttrLayout.panelsRow}>
        <section style={{ ...ttrComponents.basePanel, flex: 1.05 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Breakdown</span>
            <h2 style={ttrTypography.h2}>Five dimensions</h2>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {dimensionEntries.map(({ key, label, value }) => (
              <div
                key={key}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <span style={{ color: "rgba(226,232,240,0.75)", fontSize: 12 }}>{label}</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>{value ?? "N/A"}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...ttrComponents.basePanel, flex: 0.95 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Signals</span>
            <h2 style={ttrTypography.h2}>Strengths & gaps</h2>
          </div>

          <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#bbf7d0" }}>
                Strengths
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {assessment?.strengths?.length ? (
                  assessment.strengths.map((item, index) => (
                    <span key={`${item}-${index}`} style={ttrComponents.chip}>
                      {item}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>No strengths captured yet.</span>
                )}
              </div>
            </div>

            <div>
              <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>
                Gaps
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {assessment?.gaps?.length ? (
                  assessment.gaps.map((item, index) => (
                    <span
                      key={`${item}-${index}`}
                      style={{
                        ...ttrComponents.chip,
                        background: "rgba(248,113,113,0.12)",
                        border: "1px solid rgba(248,113,113,0.4)",
                        color: "#fecdd3",
                      }}
                    >
                      {item}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>No gaps identified.</span>
                )}
              </div>
            </div>

            <div>
              <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fde68a" }}>
                Compliance flags
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {complianceFlags.length ? (
                  complianceFlags.map((flag, index) => (
                    <span
                      key={`${flag}-${index}`}
                      style={{
                        ...ttrComponents.chip,
                        background: "rgba(251,191,36,0.12)",
                        border: "1px solid rgba(251,191,36,0.4)",
                        color: "#fef9c3",
                      }}
                    >
                      {flag}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>No compliance flags.</span>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}
