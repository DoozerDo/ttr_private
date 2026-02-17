"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { ScoreGauge } from "@/components/ScoreGauge";
import { getVerdictDisplayOrDefault } from "@/lib/fit-verdict";
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
  verdict?: string;
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
  scoring_v2?: ScoringV2Result | null;
};

type ScoringContractV1DimensionKey =
  | "role_scope_and_seniority"
  | "support_operations_and_process_rigor"
  | "tooling_and_platform_experience"
  | "domain_and_business_context"
  | "change_leadership_and_customer_advocacy";

type ScoringV2Rubric = {
  id?: string;
  weights?: Record<ScoringContractV1DimensionKey, number>;
  dimensionPercents?: Record<ScoringContractV1DimensionKey, number>;
  dimensionPoints?: Record<ScoringContractV1DimensionKey, number>;
  subtotal?: number;
};

type ScoringV2Result = {
  score: number;
  rubric: ScoringV2Rubric;
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
const LAST_ASSESSMENT_ID_KEY = "ttr-last-assessment-id";
const PRIMARY_GAP_FALLBACKS = [
  "Add Industry Experience and business outcomes in Fit Review.",
  "Add stronger process leadership and operational impact in Fit Review.",
];

type DriverBucket = "strong" | "watch" | "fix" | "pending";

const SCORING_DIMENSION_ORDER: ScoringContractV1DimensionKey[] = [
  "role_scope_and_seniority",
  "support_operations_and_process_rigor",
  "tooling_and_platform_experience",
  "domain_and_business_context",
  "change_leadership_and_customer_advocacy",
];

const PUBLIC_DIMENSION_LABELS: Record<ScoringContractV1DimensionKey, string> = {
  role_scope_and_seniority: "Leadership level",
  support_operations_and_process_rigor: "Support operations",
  tooling_and_platform_experience: "Tools and systems",
  domain_and_business_context: "Industry experience",
  change_leadership_and_customer_advocacy: "Change and customer impact",
};

type ScoreDetailCopy = {
  why: string;
  action: string;
};

const SCORE_DETAIL_COPY: Record<
  ScoringContractV1DimensionKey,
  Record<Exclude<DriverBucket, "pending">, ScoreDetailCopy>
> = {
  role_scope_and_seniority: {
    strong: {
      why: "Leadership level sits at {percent}, confirming your senior scope aligns to the role.",
      action: "Keep your leadership impact stories polished in Fit Review.",
    },
    watch: {
      why: "Leadership level sits at {percent}, so spelling out ownership would raise confidence.",
      action: "Add a clear leadership outcome with results in Fit Review.",
    },
    fix: {
      why: "Leadership level sits at {percent} and is limiting your readiness.",
      action: "Clarify senior scope and measurable impact in Fit Review before recomputing.",
    },
  },
  support_operations_and_process_rigor: {
    strong: {
      why: "Support operations sits at {percent}, showing you sustain the reliability the role needs.",
      action: "Refresh your process leadership examples in Fit Review.",
    },
    watch: {
      why: "Support operations sits at {percent}, so deeper process detail would help this signal.",
      action: "Add a process improvement story in Fit Review with concrete steps.",
    },
    fix: {
      why: "Support operations sits at {percent} and is holding the score back.",
      action: "Map your operational ownership inside Fit Review before running another evaluation.",
    },
  },
  tooling_and_platform_experience: {
    strong: {
      why: "Tools and systems sits at {percent}, aligning with the technical checklist.",
      action: "Keep the tooling ownership language current in Fit Review.",
    },
    watch: {
      why: "Tools and systems sits at {percent}, which means extra platform depth would raise confidence.",
      action: "Outline how you owned key platforms directly in Fit Review.",
    },
    fix: {
      why: "Tools and systems sits at {percent} and constrains the overall score.",
      action: "Document the missing platform coverage in Fit Review before rerunning.",
    },
  },
  domain_and_business_context: {
    strong: {
      why: "Industry experience sits at {percent}, mirroring the employer context.",
      action: "Highlight measurable domain impact inside Fit Review.",
    },
    watch: {
      why: "Industry experience sits at {percent}, so clearer business stories would lift this signal.",
      action: "Spell out the business context you drove inside Fit Review.",
    },
    fix: {
      why: "Industry experience sits at {percent} and suppresses the verdict.",
      action: "Add measurable domain outcomes in Fit Review before recomputing.",
    },
  },
  change_leadership_and_customer_advocacy: {
    strong: {
      why: "Change and customer impact sits at {percent}, showing strategic momentum.",
      action: "Keep recent change leadership wins recorded in Fit Review.",
    },
    watch: {
      why: "Change and customer impact sits at {percent}, so fresh win stories would help.",
      action: "Point to a customer advocacy win in Fit Review so this signal lifts.",
    },
    fix: {
      why: "Change and customer impact sits at {percent} and slows readiness.",
      action: "Add a change leadership story with outcomes in Fit Review.",
    },
  },
};

const PENDING_DETAIL_COPY = {
  why: "This dimension is pending, so wait for the percent before updating the story.",
  action: "Let the percent appear and then strengthen this dimension inside Fit Review.",
};

function getBucketFromPercent(percent?: number | null): DriverBucket {
  if (typeof percent !== "number") return "pending";
  if (percent >= 90) return "strong";
  if (percent >= 80) return "watch";
  return "fix";
}

function buildScoreDetailWhy(
  key: ScoringContractV1DimensionKey,
  bucket: DriverBucket,
  percentLabel: string,
): string {
  if (bucket === "pending") {
    return PENDING_DETAIL_COPY.why;
  }
  const copy = SCORE_DETAIL_COPY[key]?.[bucket];
  if (!copy) return "This dimension requires a closer look.";
  return copy.why.replace("{percent}", percentLabel);
}

function buildScoreDetailAction(key: ScoringContractV1DimensionKey, bucket: DriverBucket): string {
  if (bucket === "pending") return PENDING_DETAIL_COPY.action;
  return SCORE_DETAIL_COPY[key]?.[bucket]?.action ?? "Review this dimension inside Fit Review.";
}

const DIMENSION_LABELS: Record<keyof Required<FitDimensionScores>, string> = {
  experienceAlignment: "Experience alignment",
  leadershipLevel: "Leadership level",
  technicalPlatformFit: "Technical platform fit",
  industryContext: "Industry and context",
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

export default function FitReviewClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId") ?? "";
  const [storedAnalysis, setStoredAnalysis] = useState<StoredAnalysisRecord | null>(null);

  const [assessment, setAssessment] = useState<FitAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState<string | null>(null);

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
  const summaryText = displayAssessment?.summary ?? null;
  const heroStatusText =
    typeof displayFitScore === "number" && displayFitScore < 70
      ? "Your score is below the apply threshold. Focus on the primary gaps to raise it."
      : summaryText ?? "View the latest compatibility score and signals for this role.";
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

  const handleCheckLatestScore = async () => {
    if (rechecking) return;
    setRechecking(true);
    setRecheckError(null);

    try {
      let assessmentId: string | null = null;
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem(LAST_ASSESSMENT_ID_KEY);
        if (stored?.trim()) {
          assessmentId = stored.trim();
        }
      }

      if (!assessmentId) {
        const response = await fetch("/api/users/me/last-assessment", {
          cache: "no-store",
        });
        if (response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { lastAssessmentId?: string | null }
            | null;
          if (payload?.lastAssessmentId?.trim()) {
            assessmentId = payload.lastAssessmentId.trim();
          }
        }
      }

      const params = new URLSearchParams();
      if (assessmentId) {
        params.set("assessmentId", assessmentId);
      }
      const destination = params.toString() ? `/results?${params.toString()}` : "/results";
      await router.push(destination);
    } catch (checkError) {
      const message =
        checkError instanceof Error
          ? checkError.message
          : "Unable to recheck the score. Please try again.";
      setRecheckError(message);
    } finally {
      setRechecking(false);
    }
  };

  const primaryGapGuidance = useMemo(() => {
    const candidateGaps =
      (displayAssessment?.gaps ?? storedAnalysis?.analysis?.gaps ?? [])
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (candidateGaps.length) {
      return candidateGaps.slice(0, MAX_GAPS_TO_SHOW);
    }
    return PRIMARY_GAP_FALLBACKS.slice(0, MAX_GAPS_TO_SHOW);
  }, [displayAssessment?.gaps, storedAnalysis?.analysis?.gaps]);

  const hasAnalysis = Boolean(displayAssessment || storedAnalysis?.analysis);
  const fitReviewPath = useMemo(() => {
    if (!normalizedResolvedJobId) return "/fit-review";
    return `/fit-review?jobId=${encodeURIComponent(normalizedResolvedJobId)}`;
  }, [normalizedResolvedJobId]);

  const dimensionEntries = Object.entries(DIMENSION_LABELS).map(([key, label]) => {
    const value = dimensionScores[key as keyof FitDimensionScores] ?? null;
    return { key, label, value };
  });

  const scoringRubric = useMemo(() => {
    if (!isFitAssessment(displayAssessment)) return null;
    return displayAssessment.scoring_v2?.rubric ?? null;
  }, [displayAssessment]);

  const scoreDetails = useMemo(() => {
    if (!scoringRubric) return [];
    return SCORING_DIMENSION_ORDER.map((key) => {
      const percentValue = scoringRubric.dimensionPercents?.[key] ?? null;
      const pointsValue = scoringRubric.dimensionPoints?.[key] ?? null;
      const bucket = getBucketFromPercent(percentValue);
      const percentLabel =
        typeof percentValue === "number" ? `${percentValue.toFixed(1)}%` : "Pending";
      return {
        key,
        label: PUBLIC_DIMENSION_LABELS[key],
        percentLabel,
        percentValue,
        pointsValue,
        bucket,
        reason: buildScoreDetailWhy(key, bucket, percentLabel),
        improvement: buildScoreDetailAction(key, bucket),
      };
    });
  }, [scoringRubric]);

  const verdictInfo = useMemo(
    () => getVerdictDisplayOrDefault(displayAssessment?.verdict ?? null),
    [displayAssessment?.verdict],
  );

  const verdictLabelStyle = useMemo(() => {
    const baseStyle = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      padding: "5px 16px",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      lineHeight: 1,
      whiteSpace: "normal",
      textAlign: "center" as const,
      maxWidth: 200,
    };

    switch (verdictInfo.label) {
      case "Apply":
        return {
          ...baseStyle,
          border: "1px solid rgba(16,185,129,0.45)",
          background: "rgba(16,185,129,0.08)",
          color: "#bbf7d0",
        };
      case "Consider":
        return {
          ...baseStyle,
          border: "1px solid rgba(251,191,36,0.5)",
          background: "rgba(251,191,36,0.12)",
          color: "#fde68a",
        };
      case "Skip":
        return {
          ...baseStyle,
          border: "1px solid rgba(248,113,113,0.5)",
          background: "rgba(248,113,113,0.12)",
          color: "#fecdd3",
        };
      default:
        return {
          ...baseStyle,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.04)",
          color: "rgba(241,245,249,0.85)",
        };
    }
  }, [verdictInfo.label]);

  return (
    <InstrumentShell
      kicker="Fit Review"
      title="Role alignment review"
      subtitle="Close the primary gaps so this score rises before you apply."
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
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <ScoreGauge score={displayFitScore ?? 0} loading={loading} label="CX Fit Score" />
                  <span style={verdictLabelStyle}>{verdictInfo.label}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={ttrTypography.subtleLabel}>Overview</span>
                    <h2 style={ttrTypography.h2}>Fit summary</h2>
                  </div>

                  <p style={{ margin: 0, color: "rgba(241,245,249,0.92)", fontSize: 15 }}>
                    {heroStatusText}
                  </p>

                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span style={verdictLabelStyle}>{verdictInfo.label}</span>
                    <p
                      style={{
                        margin: 0,
                        color: "rgba(226,232,240,0.75)",
                        fontSize: 13,
                        flex: "1 1 200px",
                        minWidth: 220,
                      }}
                    >
                      {verdictInfo.description}
                    </p>
                  </div>

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
                  Recheck the latest results for this role to confirm the score.
                </p>

                <button
                  type="button"
                  onClick={handleCheckLatestScore}
                  disabled={rechecking}
                  style={{
                    ...ttrComponents.primaryButton,
                    cursor: rechecking ? "not-allowed" : "pointer",
                    opacity: rechecking ? 0.7 : 1,
                  }}
                >
                  {rechecking ? "Rechecking..." : "I think I'm qualified"}
                </button>
                <p style={{ margin: 0, color: "rgba(226,232,240,0.75)", fontSize: 13 }}>
                  Recheck your latest score on Results.
                </p>

                {recheckError ? <div style={ttrComponents.dangerBox}>{recheckError}</div> : null}
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
          </div>

          {scoreDetails.length ? (
            <section style={{ ...ttrComponents.basePanel }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={ttrTypography.subtleLabel}>Score details</span>
                <h2 style={ttrTypography.h2}>Score details</h2>
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                {scoreDetails.map((detail) => (
                  <div
                    key={detail.key}
                    style={{
                      padding: "14px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <span style={{ color: "rgba(226,232,240,0.75)", fontSize: 12 }}>
                      {detail.label}
                    </span>

                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>
                        {detail.percentValue !== null ? detail.percentLabel : "Percent pending"}
                      </span>
                      <span style={{ color: "rgba(226,232,240,0.7)", fontSize: 12 }}>
                        {detail.pointsValue !== null
                          ? `${detail.pointsValue.toFixed(1)} points`
                          : "Points pending"}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          color: "#94a3b8",
                        }}
                      >
                        Why this mattered
                      </span>
                      <p style={{ margin: 0, color: "rgba(241,245,249,0.9)", fontSize: 13 }}>
                        {detail.reason}
                      </p>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span
                        style={{
                          fontSize: 11,
                          letterSpacing: 1.5,
                          textTransform: "uppercase",
                          color: "#fcd34d",
                        }}
                      >
                        What to improve
                      </span>
                      <p style={{ margin: 0, color: "rgba(241,245,249,0.9)", fontSize: 13 }}>
                        {detail.improvement}
                      </p>
                    </div>

                    <div>
                      <FormButton onClick={() => void router.push(fitReviewPath)}>
                        Strengthen in Fit Review
                      </FormButton>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {primaryGapGuidance.length ? (
            <section style={{ ...ttrComponents.basePanel }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={ttrTypography.subtleLabel}>Primary gaps</span>
                <h2 style={ttrTypography.h2}>Primary gaps</h2>
                <p style={{ margin: 0, color: "rgba(226,232,240,0.75)", fontSize: 14 }}>
                  Close these gaps in Fit Review to raise your score.
                </p>
              </div>
              <ul className="mt-4 space-y-3 text-sm text-slate-200 pl-4 list-disc">
                {primaryGapGuidance.map((gap, index) => (
                  <li key={`primary-gap-${index}`}>{gap}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </InstrumentShell>
  );
}
