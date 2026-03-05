"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert } from "@/components/Alert";
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
import {
  fitReviewDimensionLabels,
  fitReviewQuestions,
  SCORING_DIMENSION_ORDER,
  type FitReviewAdditionPayload,
  type FitReviewDimensionKey,
} from "@/lib/fitReviewQuestions";

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
  baselineVersionId?: string | null;
  overallScore?: number;
  score?: number;
  verdict?: string;
  summary?: string;
  dimensionScores?: FitDimensionScores;
  breakdown?: {
    experience_alignment?: number;
    leadership_level?: number;
    technical_platform_fit?: number;
    industry_context?: number;
    strategic_vs_tactical?: number;
  };
  scoring_v2?: ScoringV2Result | null;
};

type ScoringV2Rubric = {
  weights?: Record<FitReviewDimensionKey, number>;
  dimensionPercents?: Record<FitReviewDimensionKey, number>;
  dimensionPoints?: Record<FitReviewDimensionKey, number>;
};

type ScoringV2Result = {
  score: number;
  rubric: ScoringV2Rubric;
};

const HERO_MESSAGE =
  "Let's make sure your resume reflects your full experience. We've highlighted the two areas with the highest impact on your score. Review them and select 'Ask me about this' to see if anything should be added or clarified.";
const ACTIONABLE_DIMENSION_COUNT = 2;

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
  const value =
    anyA.createdAt ??
    anyA.created_at ??
    anyA.createdTimestamp ??
    anyA.createdISO ??
    anyA.updatedAt ??
    anyA.updated_at ??
    null;
  return typeof value === "string" ? value : null;
}

function getAssessmentScore(assessment?: FitAssessment | AnalysisResult | null): number | null {
  if (!assessment) return null;
  if (typeof assessment.overallScore === "number") return assessment.overallScore;
  if (typeof assessment.score === "number") return assessment.score;
  return null;
}

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

function typedEntries<T extends object>(obj: T) {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

export default function FitReviewClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("jobId") ?? "";
  const [storedAnalysis, setStoredAnalysis] = useState<StoredAnalysisRecord | null>(null);
  const [assessment, setAssessment] = useState<FitAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDimension, setActiveDimension] = useState<FitReviewDimensionKey | null>(null);
  const [dialogAnswers, setDialogAnswers] = useState<
    Partial<Record<FitReviewDimensionKey, string[]>>
  >({});
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [proposedAdditions, setProposedAdditions] = useState<
    Partial<Record<FitReviewDimensionKey, string>>
  >({});
  const [approvedAdditions, setApprovedAdditions] = useState<
    Partial<Record<FitReviewDimensionKey, string>>
  >({});
  const [editingKey, setEditingKey] = useState<FitReviewDimensionKey | null>(null);
  const [editingText, setEditingText] = useState("");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [isBuildingResume, setIsBuildingResume] = useState(false);

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

  const scoringRubric = useMemo(() => {
    if (!isFitAssessment(displayAssessment)) return null;
    return displayAssessment.scoring_v2?.rubric ?? null;
  }, [displayAssessment]);

  const fitAssessment = useMemo<FitAssessment | null>(() => {
    return isFitAssessment(displayAssessment) ? displayAssessment : null;
  }, [displayAssessment]);

  const dimensionScores = useMemo(() => normalizeDimensions(fitAssessment), [fitAssessment]);
  const dimensionEntries = useMemo(
    () =>
      SCORING_DIMENSION_ORDER.map((key) => {
        const percent = scoringRubric?.dimensionPercents?.[key] ?? null;
        const points = scoringRubric?.dimensionPoints?.[key] ?? null;
        const normalized = dimensionScores[
          key as keyof FitDimensionScores
        ] as number | null;
        return {
          key,
          label: fitReviewDimensionLabels[key],
          percent,
          points,
          normalizedValue:
            typeof normalized === "number" ? normalized : null,
        };
      }),
    [dimensionScores, scoringRubric],
  );

  const actionableDimensionKeys = useMemo(() => {
    if (!dimensionEntries.length) return new Set<FitReviewDimensionKey>();
    const hasPercent = dimensionEntries.some((entry) => typeof entry.percent === "number");
    if (!hasPercent) return new Set<FitReviewDimensionKey>();
    const sorted = [...dimensionEntries]
      .map((entry, index) => ({
        key: entry.key,
        sortValue:
          typeof entry.percent === "number"
            ? entry.percent
            : Infinity,
        order: index,
      }))
      .sort((a, b) => {
        if (a.sortValue !== b.sortValue) {
          return a.sortValue - b.sortValue;
        }
        return a.order - b.order;
      })
      .slice(0, ACTIONABLE_DIMENSION_COUNT)
      .map((entry) => entry.key);
    return new Set(sorted);
  }, [dimensionEntries]);

  const heroScoreText = `Score: ${getAssessmentScore(displayAssessment)?.toFixed(1) ?? "Pending"}`;
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

  useEffect(() => {
    if (
      process.env.NODE_ENV === "development" &&
      normalizedResolvedJobId &&
      getAssessmentScore(displayAssessment) !== null
    ) {
      console.debug(
        "[FitReview dev] jobId",
        normalizedResolvedJobId,
        "score",
        getAssessmentScore(displayAssessment),
      );
    }
  }, [normalizedResolvedJobId, displayAssessment]);

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
          { cache: "no-store" },
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
            loadError instanceof Error
              ? loadError.message
              : "Unable to load fit review data.";
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

  const hasAnalysis = Boolean(displayAssessment || storedAnalysis?.analysis);
  const baselineId = displayAssessment?.baselineId?.trim() ?? null;
  const jobIdForClone = displayAssessment?.jobId?.trim() ?? null;

  const openDimensionDialog = (dimension: FitReviewDimensionKey) => {
    setDialogError(null);
    setActiveDimension(dimension);
    setDialogAnswers((prev) => {
      const existing = prev[dimension];
      const targetLength = fitReviewQuestions[dimension].length;
      if (existing && existing.length === targetLength) {
        return prev;
      }
      return {
        ...prev,
        [dimension]: Array(targetLength).fill(""),
      };
    });
  };

  const closeDialog = () => {
    setActiveDimension(null);
    setDialogError(null);
  };

  const handleAnswerChange = (index: number, value: string) => {
    if (!activeDimension) return;
    setDialogAnswers((prev) => {
      const answers = prev[activeDimension] ?? Array(fitReviewQuestions[activeDimension].length).fill("");
      const next = [...answers];
      next[index] = value;
      return {
        ...prev,
        [activeDimension]: next,
      };
    });
  };

  const handleDialogSubmit = () => {
    if (!activeDimension) return;
    const answers = (dialogAnswers[activeDimension] ?? [])
      .map((answer) => answer.trim())
      .filter((answer) => answer.length);

    if (!answers.length) {
      setDialogError("Please share at least one detail to craft the evidence.");
      return;
    }

    const additionText = answers.join(" - ");
    setProposedAdditions((prev) => ({
      ...prev,
      [activeDimension]: additionText,
    }));
    setDialogError(null);
    setActiveDimension(null);
  };

  const handleStartEditing = (dimension: FitReviewDimensionKey) => {
    const existing =
      proposedAdditions[dimension] ?? approvedAdditions[dimension] ?? "";
    setEditingKey(dimension);
    setEditingText(existing ?? "");
  };

  const handleSaveEdit = () => {
    if (!editingKey) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      return;
    }
    setProposedAdditions((prev) => ({
      ...prev,
      [editingKey]: trimmed,
    }));
    setEditingKey(null);
    setEditingText("");
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditingText("");
  };

  const handleApproveAddition = (dimension: FitReviewDimensionKey) => {
    const addition = proposedAdditions[dimension] ?? "";
    if (!addition) return;
    setApprovedAdditions((prev) => ({
      ...prev,
      [dimension]: addition,
    }));
    setProposedAdditions((prev) => {
      const next = { ...prev };
      delete next[dimension];
      return next;
    });
    setEditingKey(null);
  };

  const handleBuildUpdatedResume = async () => {
    if (!baselineId || !jobIdForClone) {
      setBuildError("Baseline and job context are required.");
      return;
    }

    const approvedEntries = typedEntries(approvedAdditions).filter(
      ([, value]) => Boolean(value?.trim().length),
    );
    const additions: FitReviewAdditionPayload[] = approvedEntries.map(
      ([dimensionId, approvedText]) => ({
        dimensionId,
        approvedText: approvedText!.trim(),
      }),
    );

    if (!additions.length) {
      setBuildError("At least one approved addition is required.");
      return;
    }

    setIsBuildingResume(true);
    setBuildError(null);

    try {
      const response = await fetch(`/api/baselines/${baselineId}/fit-review/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: jobIdForClone,
          additions,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ?? payload?.message ?? "Unable to build the updated resume.";
        throw new Error(message);
      }

      await router.push("/baseline?toast=new_baseline");
    } catch (buildIssue) {
      const message =
        buildIssue instanceof Error ? buildIssue.message : "Unable to build the updated resume.";
      setBuildError(message);
    } finally {
      setIsBuildingResume(false);
    }
  };

  const approvedCount = Object.values(approvedAdditions).filter(
    (value) => Boolean(value?.trim().length),
  ).length;

  return (
    <InstrumentShell
      kicker="Fit Review"
      title="Resume Strengthening"
      subtitle={HERO_MESSAGE}
    >
          {!hasAnalysis ? (
            <div className="px-6 py-10">
              <EmptyState
                title="Fit Review needs Analyze"
                body="Run Analyze to load the latest compatibility score and focus on the most important gaps."
                cta={
                  <FormButton variant="ghost" onClick={() => router.push("/analyze")}>
                    Run Analyze
                  </FormButton>
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
                  position: "relative",
                  display: "flex",
                  gap: 20,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <ScoreGauge score={getAssessmentScore(displayAssessment) ?? undefined} loading={loading} label="CX Fit Score" />
                  <span style={ttrTypography.caption}>{verdictInfo.label}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={ttrTypography.subtleLabel}>Overview</span>
                    <h2 style={ttrTypography.h2}>Resume Strengthening</h2>
                  </div>
                  <p style={{ margin: 0, color: "rgba(241,245,249,0.92)", fontSize: 15 }}>
                    {displayAssessment?.summary ?? "Capture evidence for the highlighted dimensions to evolve the baseline."}
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
                  <p className="text-xs text-slate-300">{heroScoreText}</p>
                </div>
              </div>
            </section>
          </div>

          <section style={{ ...ttrComponents.basePanel }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Dimensions</span>
              <h2 style={ttrTypography.h2}>Scoring focus</h2>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {dimensionEntries.map((entry) => {
                const isActionable = actionableDimensionKeys.has(entry.key);
                const isReviewed = Boolean(approvedAdditions[entry.key]);
                const additionText = approvedAdditions[entry.key] ?? proposedAdditions[entry.key];
                const isEditing = editingKey === entry.key;
                const cardBorder = isActionable && !isReviewed ? "border-emerald-500/40 bg-emerald-900/30" : "border-white/10 bg-white/5";
                return (
                  <article
                    key={entry.key}
                    className={`rounded-2xl border p-4 text-slate-200 ${cardBorder}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{entry.label}</p>
                      {isReviewed ? (
                        <span className="text-xs text-emerald-300">Reviewed</span>
                      ) : isActionable ? (
                        <span className="text-xs text-sky-300">Actionable</span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {typeof entry.percent === "number"
                        ? `${entry.percent.toFixed(1)}%`
                        : entry.normalizedValue !== null
                          ? `${entry.normalizedValue.toFixed(1)}`
                          : "Pending"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {entry.points !== null
                        ? `${entry.points.toFixed(1)} points`
                        : "Points pending"}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {isActionable
                        ? "This gap has the highest impact on your score right now."
                        : "Informational view of this dimension."}
                    </p>
                    {isActionable && !isReviewed ? (
                      <div className="mt-4">
                        <FormButton
                          variant="secondary"
                          onClick={() => openDimensionDialog(entry.key)}
                        >
                          Ask me about this
                        </FormButton>
                      </div>
                    ) : null}
                    {additionText ? (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/70 p-3 text-sm text-slate-100">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                          Proposed addition
                        </p>
                        {isEditing ? (
                          <div className="mt-1 space-y-2">
                            <textarea
                              className="w-full rounded-xl border border-white/10 bg-slate-900/50 p-2 text-sm text-slate-100 outline-none"
                              rows={3}
                              value={editingText}
                              onChange={(event) => setEditingText(event.target.value)}
                            />
                            <div className="flex gap-2">
                              <FormButton
                                variant="secondary"
                                onClick={handleSaveEdit}
                              >
                                Save
                              </FormButton>
                              <FormButton variant="ghost" onClick={handleCancelEdit}>
                                Cancel
                              </FormButton>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="mt-1 text-slate-200">{additionText}</p>
                            {!isReviewed ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <FormButton
                                  variant="secondary"
                                  onClick={() => handleStartEditing(entry.key)}
                                >
                                  Edit
                                </FormButton>
                                <FormButton onClick={() => handleApproveAddition(entry.key)}>
                                  Approve addition
                                </FormButton>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          {approvedCount ? (
            <section style={{ ...ttrComponents.basePanel }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={ttrTypography.subtleLabel}>Baseline evolution</span>
                <h2 style={ttrTypography.h2}>Build updated resume</h2>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Each approved addition will be captured in a new baseline clone. After the clone lands in the Resume Library, re-run compatibility scoring manually.
              </p>
              <div className="mt-4 space-y-3">
                {buildError ? (
                  <Alert intent="error" title="Unable to build updated resume">
                    {buildError}
                  </Alert>
                ) : null}
                <FormButton
                  onClick={handleBuildUpdatedResume}
                  disabled={isBuildingResume || !baselineId || !jobIdForClone}
                >
                  {isBuildingResume ? "Building updated resume..." : "Build updated resume"}
                </FormButton>
              </div>
            </section>
          ) : null}
        </>
      )}

      {activeDimension ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-50 shadow-2xl shadow-black/80"
          >
            <h2 className="text-xl font-semibold text-white">
              {fitReviewDimensionLabels[activeDimension]}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Capture evidence for this dimension. Keep your answers factual and based on your experience.
            </p>
            <div className="mt-4 space-y-4">
              {fitReviewQuestions[activeDimension].map((prompt, index) => (
                <div key={`${activeDimension}-${index}`} className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{`Prompt ${index + 1}`}</p>
                  <p className="text-sm text-slate-200">{prompt}</p>
                  <textarea
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-100 outline-none"
                    rows={3}
                    value={(dialogAnswers[activeDimension] ?? [])[index] ?? ""}
                    onChange={(event) => handleAnswerChange(index, event.target.value)}
                  />
                </div>
              ))}
            </div>
            {dialogError ? (
              <p className="mt-4 text-sm text-rose-300">{dialogError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <FormButton variant="ghost" onClick={closeDialog}>
                Cancel
              </FormButton>
              <FormButton onClick={handleDialogSubmit}>Generate proposal</FormButton>
            </div>
          </div>
        </div>
      ) : null}
    </InstrumentShell>
  );
}
