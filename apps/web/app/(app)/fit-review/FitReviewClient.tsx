"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import {
  fetchStudyPacket,
  StudyPacket,
  StudyPacketError,
} from "@/lib/interviewToolkit";
import type { InterviewQuestion } from "@/lib/interviews";
import {
  LAST_ANALYSIS_STORAGE_KEY,
  readLastAnalysis,
  type AnalysisResult,
  type StoredAnalysisRecord,
} from "../lib/session";
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
  baselineVersion?: number | null;
  baselineVersionId?: string | null;
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

function parseTimestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function getAssessmentCreatedTimestamp(a: FitAssessment | null | undefined): string | null {
  if (!a) return null;
  const anyA = a as unknown as {
    createdAt?: string;
    created_at?: string;
    createdTimestamp?: string;
    createdISO?: string;
    updatedAt?: string;
    updated_at?: string;
  };
  const v =
    anyA.createdAt ??
    anyA.created_at ??
    anyA.createdTimestamp ??
    anyA.createdISO ??
    anyA.updatedAt ??
    anyA.updated_at ??
    null;
  return typeof v === "string" ? v : null;
}

function getAssessmentScore(assessment?: FitAssessment | AnalysisResult | null): number | null {
  if (!assessment) return null;
  if (typeof assessment.overallScore === "number") return assessment.overallScore;
  if (typeof assessment.score === "number") return assessment.score;
  return null;
}

const MAX_GAPS_TO_SHOW = 3;
const MAX_QUESTIONS_PER_GAP = 5;

const normalizeGapText = (value: string): string => value.trim().toLowerCase();

const matchesGapReference = (reference: string, normalizedGap: string): boolean => {
  if (!reference || !normalizedGap) return false;

  if (reference.includes(normalizedGap) || normalizedGap.includes(reference)) {
    return true;
  }

  const gapWords = normalizedGap.split(/\W+/).filter(Boolean);
  if (!gapWords.length) return false;

  const matchCount = gapWords.filter((word) => reference.includes(word)).length;
  return matchCount >= Math.min(2, gapWords.length);
};

type QuestionGroup = {
  gap: string;
  questions: InterviewQuestion[];
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

function isFitAssessment(
  value: FitAssessment | AnalysisResult | null | undefined,
): value is FitAssessment {
  if (!value || typeof value !== "object") return false;
  return (
    "baselineVersionId" in value ||
    "dimensionScores" in value ||
    "breakdown" in value
  );
}

function getComplianceFlagsSource(
  value: FitAssessment | AnalysisResult | null | undefined,
): unknown {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as {
    complianceFlags?: unknown;
    compliance_flags?: unknown;
  };
  return candidate.complianceFlags ?? candidate.compliance_flags;
}

function normalizeComplianceFlags(
  flags?: string[] | ComplianceFlagLike[] | undefined,
): string[] {
  if (!flags) return [];
  if (Array.isArray(flags) && typeof flags[0] === "string") return flags as string[];

  if (Array.isArray(flags)) {
    return (flags as Array<{ code?: string; message?: string }>)
      .map((flag) => flag?.code || flag?.message)
      .filter((item): item is string => Boolean(item));
  }

  return [];
}

type ComplianceFlagLike = { code?: string; message?: string };

function getComplianceFlagsInput(
  value: unknown,
): string[] | ComplianceFlagLike[] | undefined {
  if (!value) return undefined;
  if (!Array.isArray(value)) return undefined;
  if (value.every((item) => typeof item === "string")) {
    return value as string[];
  }
  if (
    value.every(
      (item) => item && typeof item === "object" && ("code" in item || "message" in item),
    )
  ) {
    return value as ComplianceFlagLike[];
  }
  return undefined;
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
          CX Fit Score
        </span>
      </div>
    </div>
  );
};

export default function FitReviewClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId") ?? "";
  const [storedAnalysis, setStoredAnalysis] = useState<StoredAnalysisRecord | null>(null);
  const [studyPacket, setStudyPacket] = useState<StudyPacket | null>(null);
  const [packetState, setPacketState] = useState<"idle" | "loading" | "error">("idle");
  const [packetError, setPacketError] = useState<string | null>(null);

  const [assessment, setAssessment] = useState<FitAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startedInterviewId, setStartedInterviewId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStoredAnalysis(readLastAnalysis());
    refresh();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LAST_ANALYSIS_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const resolvedJobId = jobId || storedAnalysis?.jobId || "";
  const normalizedResolvedJobId = resolvedJobId.trim();
  const storedSavedTimestamp = useMemo(
    () => parseTimestamp(storedAnalysis?.savedAt ?? null),
    [storedAnalysis?.savedAt],
  );
  const remoteCreatedTimestamp = useMemo(
    () => parseTimestamp(getAssessmentCreatedTimestamp(assessment)),
    [assessment],
  );
  const storedJobMatchesResolved =
    Boolean(normalizedResolvedJobId && storedAnalysis?.jobId?.trim() === normalizedResolvedJobId);
  const displayAssessment = useMemo(() => {
    if (storedJobMatchesResolved && storedAnalysis?.analysis) {
      if (storedSavedTimestamp >= remoteCreatedTimestamp) {
        return storedAnalysis.analysis;
      }
    }

    if (
      assessment &&
      normalizedResolvedJobId &&
      assessment.jobId?.trim() === normalizedResolvedJobId
    ) {
      return assessment;
    }

    if (storedJobMatchesResolved && storedAnalysis?.analysis) {
      return storedAnalysis.analysis;
    }

    return assessment ?? storedAnalysis?.analysis ?? null;
  }, [
    assessment,
    normalizedResolvedJobId,
    remoteCreatedTimestamp,
    storedAnalysis?.analysis,
    storedJobMatchesResolved,
    storedSavedTimestamp,
  ]);
  const dimensionScores = useMemo(() => {
    if (isFitAssessment(displayAssessment)) {
      return normalizeDimensions(displayAssessment);
    }
    return {};
  }, [displayAssessment]);
  const rawComplianceFlags = getComplianceFlagsSource(displayAssessment);
  const complianceFlags = normalizeComplianceFlags(
    getComplianceFlagsInput(rawComplianceFlags),
  );
  const displayFitScore = getAssessmentScore(displayAssessment);
  const displayBaselineId =
    displayAssessment?.baselineId ?? assessment?.baselineId ?? storedAnalysis?.baselineId;
  const summaryText = displayAssessment?.summary ?? null;
  const interviewAssessment = useMemo(
    () =>
      assessment &&
      assessment.jobId &&
      assessment.baselineId &&
      assessment.baselineVersionId
        ? assessment
        : displayAssessment,
    [assessment, displayAssessment],
  );
  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      normalizedResolvedJobId &&
      displayFitScore !== null
    ) {
      console.debug("[FitReview dev] jobId", normalizedResolvedJobId, "score", displayFitScore);
    }
  }, [normalizedResolvedJobId, displayFitScore]);

  useEffect(() => {
    if (!resolvedJobId) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setAssessment(null);

      try {
        const response = await fetch(
          `/api/analysis/job/${encodeURIComponent(resolvedJobId)}/latest`,
          {
            cache: "no-store",
          },
        );

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
  }, [resolvedJobId]);

  useEffect(() => {
    if (!resolvedJobId) {
      setStudyPacket(null);
      setPacketState("idle");
      setPacketError(null);
      return;
    }

    let cancelled = false;
    setPacketState("loading");
    setPacketError(null);

    fetchStudyPacket(resolvedJobId)
      .then((packet) => {
        if (!cancelled) {
          setStudyPacket(packet);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          const message =
            fetchError instanceof StudyPacketError
              ? fetchError.message
              : fetchError instanceof Error
                ? fetchError.message
                : "Unable to load study packet.";
          setPacketError(message);
          setStudyPacket(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPacketState("idle");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedJobId]);

  const handleStartInterview = async () => {
    const source = interviewAssessment;
    if (!source?.jobId || !source?.baselineId) {
      setStartError("Missing job or baseline context for this assessment.");
      return;
    }

    if (!source?.baselineVersionId) {
      setStartError("Missing baseline version for this assessment.");
      return;
    }

    setStarting(true);
    setStartError(null);

    try {
      const response = await fetch("/api/interview-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: source.jobId,
          baselineId: source.baselineId,
          baselineVersionId: source.baselineVersionId,
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

  const gapLabels = useMemo(() => {
    const candidateGaps =
      displayAssessment?.gaps ?? studyPacket?.fitSnapshot?.gaps ?? storedAnalysis?.analysis?.gaps ?? [];
    if (!Array.isArray(candidateGaps)) return [];
    return candidateGaps
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, MAX_GAPS_TO_SHOW);
  }, [displayAssessment?.gaps, studyPacket?.fitSnapshot?.gaps, storedAnalysis?.analysis?.gaps]);

  const questionGroups = useMemo((): QuestionGroup[] => {
    if (!studyPacket?.questions || gapLabels.length === 0) return [];

    return gapLabels
      .map((gap) => {
        const normalized = normalizeGapText(gap);
        const matches = studyPacket.questions
          .filter((question) => {
            const reference = (question.jdReference ?? "").trim().toLowerCase();
            return matchesGapReference(reference, normalized);
          })
          .slice(0, MAX_QUESTIONS_PER_GAP);
        return { gap, questions: matches };
      })
      .filter((group) => group.questions.length > 0);
  }, [gapLabels, studyPacket?.questions]);

  const hasAnalysis = Boolean(displayAssessment || storedAnalysis?.analysis || studyPacket?.fitSnapshot);
  const displayJobId = displayAssessment?.jobId ?? resolvedJobId;

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
        displayJobId ? (
          <span style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>Job: {displayJobId}</span>
        ) : null
      }
    >
      {!hasAnalysis ? (
        <div className="px-6 py-10">
          <EmptyState
            title="Fit Review needs Analyze"
            body="Run Analyze to generate gaps for Fit Review."
            cta={
              <Link href="/analyze">
                <FormButton>Run Analyze</FormButton>
              </Link>
            }
            className="max-w-full border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
          />
        </div>
      ) : (
        <>
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
                <ScoreRing score={displayFitScore ?? 0} loading={loading} />

                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={ttrTypography.subtleLabel}>Overview</span>
                    <h2 style={ttrTypography.h2}>Fit summary</h2>
                  </div>

                  {summaryText ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          letterSpacing: 2.5,
                          textTransform: "uppercase",
                          color: "rgba(226,232,240,0.55)",
                        }}
                      >
                        Signal coverage
                      </span>
                      <p style={{ margin: 0, color: "rgba(241,245,249,0.92)", fontSize: 15 }}>
                        {summaryText}
                      </p>
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: "rgba(241,245,249,0.92)", fontSize: 15 }}>
                      View the latest compatibility score and signals for this role.
                    </p>
                  )}

                  {displayBaselineId ? (
                    <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                      Baseline: {displayBaselineId}
                    </div>
                  ) : null}

                  {error ? <div style={ttrComponents.dangerBox}>{error}</div> : null}
                  {!error && !loading && !displayAssessment ? (
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
                  disabled={
                    starting ||
                    !interviewAssessment?.jobId ||
                    !interviewAssessment?.baselineId ||
                    !interviewAssessment?.baselineVersionId
                  }
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
                    <Link
                      href={`/interviews/${startedInterviewId}`}
                      style={{ color: "#c084fc", textDecoration: "underline" }}
                    >
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

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                }}
              >
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
                    <span style={{ fontSize: 22, fontWeight: 800, color: "#e2e8f0" }}>
                      {value ?? "N/A"}
                    </span>
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
                    {displayAssessment?.strengths?.length ? (
                      displayAssessment.strengths.map((item, index) => (
                        <span key={`${item}-${index}`} style={ttrComponents.chip}>
                          {item}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                        No strengths captured yet.
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>
                    Gaps
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {displayAssessment?.gaps?.length ? (
                      displayAssessment.gaps.map((item, index) => (
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
                      <span style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                        No gaps identified.
                      </span>
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

          <section style={{ ...ttrComponents.basePanel }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Gap-focused prep</span>
              <h2 style={ttrTypography.h2}>Interview questions</h2>
            </div>
            <div style={{ marginTop: 16 }}>
              {packetState === "loading" ? (
                <div className="rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
                  Loading filtered questions...
                </div>
              ) : packetError ? (
                <div style={ttrComponents.dangerBox}>{packetError}</div>
              ) : questionGroups.length ? (
                <div className="space-y-6">
                  {questionGroups.map((group) => (
                    <div key={group.gap} className="space-y-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Gap</p>
                        <p className="text-lg font-semibold text-white">{group.gap}</p>
                      </div>
                      <ul className="space-y-2 text-sm text-slate-200 pl-4 list-disc">
                        {group.questions.map((question, index) => (
                          <li key={`${question.gapId}-${index}`} className="space-y-1">
                            <p className="font-semibold text-white">{question.prompt}</p>
                            <p className="text-xs text-slate-400">{question.jdReference}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  {gapLabels.length
                    ? "No questions currently map to the identified gaps. Run Analyze again to refresh."
                    : "Run Analyze to generate gaps for Fit Review."}
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </InstrumentShell>
  );
}
