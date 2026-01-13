"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import type {
  InterviewGap,
  InterviewQuestion,
  InterviewSessionDto,
  RecommendedAddition,
  RecommendedAdditionDecision,
} from "@/lib/interviews";
import {
  computeInterviewExpandedFit,
  getInterviewSession,
  promoteInterviewAcceptedAdditions,
  saveInterviewResponses,
  submitInterviewAdditionDecisions,
  updateInterviewAcceptedAdditions,
} from "@/lib/interviewsClient";
import type {
  InterviewExpandedFitResponse,
  InterviewPromotionResponse,
} from "@/lib/interviewsClient";

type ComplianceFlag = {
  code?: string;
  message?: string;
  severity?: string;
  questionIndex?: number;
  recommendationIndex?: number;
};

type ComplianceLookup = {
  general: ComplianceFlag[];
  questions: Record<number, ComplianceFlag[]>;
  recommendations: Record<number, ComplianceFlag[]>;
};

function normalizeCompliance(validationResults?: Record<string, unknown>): ComplianceLookup {
  const lookup: ComplianceLookup = { general: [], questions: {}, recommendations: {} };
  if (!validationResults) return lookup;

  const rawFlags =
    (validationResults as { complianceFlags?: unknown; compliance_flags?: unknown }).complianceFlags ??
    (validationResults as { compliance_flags?: unknown }).compliance_flags ??
    [];

  const flagsArray = Array.isArray(rawFlags) ? rawFlags : [];

  flagsArray.forEach((flag) => {
    const normalized: ComplianceFlag =
      typeof flag === "string"
        ? { message: flag }
        : typeof flag === "object" && flag !== null
          ? {
              code: (flag as { code?: string }).code,
              message: (flag as { message?: string }).message,
              severity: (flag as { severity?: string }).severity,
              questionIndex:
                (flag as { questionIndex?: number }).questionIndex ??
                (flag as { question_index?: number }).question_index ??
                (flag as { questionIdx?: number }).questionIdx,
              recommendationIndex:
                (flag as { recommendationIndex?: number }).recommendationIndex ??
                (flag as { recommendation_index?: number }).recommendation_index ??
                (flag as { recommendationIdx?: number }).recommendationIdx,
            }
          : {};

    if (normalized.questionIndex !== undefined && normalized.questionIndex >= 0) {
      const existing = lookup.questions[normalized.questionIndex] ?? [];
      lookup.questions[normalized.questionIndex] = [...existing, normalized];
      return;
    }

    if (normalized.recommendationIndex !== undefined && normalized.recommendationIndex >= 0) {
      const existing = lookup.recommendations[normalized.recommendationIndex] ?? [];
      lookup.recommendations[normalized.recommendationIndex] = [...existing, normalized];
      return;
    }

    lookup.general.push(normalized);
  });

  return lookup;
}

function readNumericField(payload: unknown, keys: string[]): number | null {
  if (!payload || typeof payload !== "object") return null;

  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "number") return value;
  }

  return null;
}

function readStringField(payload: unknown, keys: string[]): string | null {
  if (!payload || typeof payload !== "object") return null;

  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }

  return null;
}

function formatDimensionLabel(value: string): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((segment) => {
      if (!segment) return "";
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(" ");
}

function formatTimestamp(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function describeAdditionSource(addition: RecommendedAddition): string {
  const sources = Array.isArray(addition.sources) ? addition.sources : [];
  const labels: string[] = [];

  sources.forEach((source) => {
    if (source.gapId) labels.push(`Gap ${source.gapId}`);
    if (typeof source.questionIndex === "number") labels.push(`Question ${source.questionIndex + 1}`);
    if (source.questionPrompt) labels.push(`Prompt: ${source.questionPrompt}`);
  });

  if (!labels.length) return "General addition";

  return labels.slice(0, 2).join(" | ");
}

const COMPLETION_STATUS_VALUES = ["complete", "completed", "done", "closed", "finished"];

type ComputeStatus = "idle" | "loading" | "success" | "error";

const debugUiEnabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;
  const [session, setSession] = useState<InterviewSessionDto | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionSavingId, setDecisionSavingId] = useState<string | null>(null);
  const [acceptedAdditionIds, setAcceptedAdditionIds] = useState<string[]>([]);
  const [acceptedSaving, setAcceptedSaving] = useState(false);
  const [acceptedError, setAcceptedError] = useState<string | null>(null);
  const [expandedComputing, setExpandedComputing] = useState(false);
  const [expandedComputeError, setExpandedComputeError] = useState<string | null>(null);
  const [lastComputeStatus, setLastComputeStatus] = useState<ComputeStatus>('idle');
  const [lastComputeAt, setLastComputeAt] = useState<string | null>(null);
  const [hasExpandedFitData, setHasExpandedFitData] = useState(false);
  const [expandedFitResult, setExpandedFitResult] = useState<InterviewExpandedFitResponse | null>(null);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [promotionResult, setPromotionResult] = useState<InterviewPromotionResponse | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  const applySessionUpdate = useCallback(
    (data: InterviewSessionDto, options?: { preserveAnswers?: boolean }) => {
      setSession(data);

      if (options?.preserveAnswers) {
        return;
      }

      const questionCount = data?.questions?.length ?? 0;
      const existingResponses =
        Array.isArray(data?.responses) && data.responses.length
          ? data.responses.map((entry) => entry?.toString() ?? "")
          : [];

      setAnswers((prev) => {
        if (prev.length === questionCount && existingResponses.length === 0) {
          return prev;
        }
        return Array.from({ length: questionCount }, (_, index) => existingResponses[index] ?? "");
      });
    },
    [],
  );

  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      try {
        const data = await getInterviewSession(sessionId);
        applySessionUpdate(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load interview session.");
      }
    };

    loadSession();
  }, [applySessionUpdate, sessionId]);

  useEffect(() => {
    setAcceptedAdditionIds(session?.acceptedAdditionIds ?? []);
  }, [session?.acceptedAdditionIds]);

  useEffect(() => {
    if (!session?.expandedFitAssessment) {
      setExpandedFitResult(null);
    }
  }, [session?.expandedFitAssessment]);

  const questions: InterviewQuestion[] = useMemo(() => session?.questions ?? [], [session?.questions]);
  const gaps: InterviewGap[] = useMemo(() => session?.gapList ?? [], [session?.gapList]);
  const recommendedAdditions: RecommendedAddition[] = useMemo(() => {
    const additions = session?.recommendedAdditions ?? [];
    return additions.map((addition) => ({
      ...addition,
      status: addition.status ?? "proposed",
    }));
  }, [session?.recommendedAdditions]);
  const acceptedAdditionSet = useMemo(
    () => new Set(acceptedAdditionIds),
    [acceptedAdditionIds],
  );
  const acceptedAdditions = useMemo(
    () => recommendedAdditions.filter((addition) => acceptedAdditionSet.has(addition.id)),
    [acceptedAdditionSet, recommendedAdditions],
  );
  const complianceLookup = useMemo(
    () => normalizeCompliance(session?.validationResults),
    [session?.validationResults],
  );

  const gapMap = useMemo(() => {
    const map = new Map<string, InterviewGap>();
    gaps.forEach((gap) => map.set(gap.gapId, gap));
    return map;
  }, [gaps]);

  const baselineVersionHash = useMemo(() => {
    if (typeof session?.baselineVersionHash === "string") return session.baselineVersionHash;

    const validation = session?.validationResults && typeof session.validationResults === "object"
      ? session.validationResults
      : null;

    if (!validation) return null;

    const camelCaseValue = (validation as { baselineVersionHash?: unknown }).baselineVersionHash;
    if (typeof camelCaseValue === "string") return camelCaseValue;

    const snakeCaseValue = (validation as { baseline_version_hash?: unknown }).baseline_version_hash;
    return typeof snakeCaseValue === "string" ? snakeCaseValue : null;
  }, [session]);

  const baselineVersionReference = useMemo(() => {
    const id = session?.baselineVersionId ?? null;
    if (id && baselineVersionHash) return `${id} (${baselineVersionHash})`;
    return id ?? baselineVersionHash ?? null;
  }, [baselineVersionHash, session?.baselineVersionId]);

  const promotedBaselineReference = useMemo(() => {
    const id =
      promotionResult?.baselineVersionId ??
      expandedFitResult?.promotedBaselineVersionId ??
      session?.promotedBaselineVersionId ??
      null;
    const hash =
      promotionResult?.baselineVersionHash ??
      expandedFitResult?.baselineVersionHash ??
      null;
    if (id && hash) return `${id} (${hash})`;
    return id ?? hash ?? null;
  }, [
    promotionResult?.baselineVersionHash,
    promotionResult?.baselineVersionId,
    session?.promotedBaselineVersionId,
    expandedFitResult?.promotedBaselineVersionId,
    expandedFitResult?.baselineVersionHash,
  ]);
  const baselineAvailable = Boolean(session?.baselineId && session?.baselineVersionId);
  const baselineMissingForSession = Boolean(session) && !baselineAvailable;
  const expandedFitSession = expandedFitResult ?? session;
  const expandedFitAssessment = expandedFitSession?.expandedFitAssessment ?? null;

  const expandedFitDetails = useMemo(() => {
    const assessment = expandedFitAssessment;
    if (!assessment) return null;

    const expandedScore = readNumericField(assessment, ["expandedScore", "expanded_score"]);
    const originalScore = readNumericField(assessment, ["originalScore", "original_score"]);
    const delta = readNumericField(assessment, ["delta"]);
    const expandedVerdict = readStringField(assessment, ["expandedVerdict", "expanded_verdict"]);
    const originalVerdict = readStringField(assessment, ["originalVerdict", "original_verdict"]);

    if (expandedScore === null && originalScore === null && delta === null) return null;

    return { expandedScore, originalScore, delta, expandedVerdict, originalVerdict };
  }, [expandedFitAssessment]);

  const expandedDimensionBreakdown = useMemo(() => {
    const assessment = expandedFitAssessment;
    if (!assessment) return null;

    const candidate =
      (assessment as Record<string, unknown>).expandedDimensionScores ??
      (assessment as Record<string, unknown>).dimensionScores;
    if (!candidate || typeof candidate !== "object") return null;

    const entries = Object.entries(candidate)
      .map(([dimension, value]) => ({
        dimension,
        label: formatDimensionLabel(dimension),
        value: typeof value === "number" && Number.isFinite(value) ? value : null,
      }))
      .filter(
        (entry): entry is { dimension: string; label: string; value: number } => entry.value !== null,
      );

    return entries.length ? entries : null;
  }, [expandedFitAssessment]);

  const expandedFitMetadata = useMemo(() => {
    if (!expandedFitSession) return null;
    const assessment = expandedFitSession.expandedFitAssessment;
    const baselineName = expandedFitSession.baselineId ?? null;
    const baselineVersionId = expandedFitSession.baselineVersionId ?? null;
    const baselineVersionHash = expandedFitSession.baselineVersionHash ?? null;
    const baselineVersionNumber =
      readNumericField(assessment, ["baselineVersion", "baseline_version"]) ??
      (typeof expandedFitSession.baselineVersion === "number"
        ? expandedFitSession.baselineVersion
        : null);

    const timestamp =
      readStringField(assessment, ["createdAt", "created_at"]) ?? expandedFitSession.updatedAt ?? null;
    const computedAt = formatTimestamp(timestamp);

    if (
      !baselineName &&
      !baselineVersionId &&
      baselineVersionNumber == null &&
      !baselineVersionHash &&
      !computedAt
    ) {
      return null;
    }

    return {
      baselineName,
      baselineVersionId,
      baselineVersionNumber,
      baselineVersionHash,
      computedAt,
    };
  }, [
    session,
      expandedFitSession?.baselineId,
      expandedFitSession?.baselineVersion,
      expandedFitSession?.baselineVersionHash,
      expandedFitSession?.baselineVersionId,
      expandedFitSession?.updatedAt,
      expandedFitSession?.expandedFitAssessment,
    ]);

  const promotedBaselineMetadata = useMemo(() => {
    const baselineVersionId =
      promotionResult?.baselineVersionId ??
      expandedFitResult?.promotedBaselineVersionId ??
      session?.promotedBaselineVersionId ??
      null;
    const versionNumber = promotionResult?.versionNumber ?? null;
    const baselineVersionHash =
      promotionResult?.baselineVersionHash ??
      expandedFitResult?.baselineVersionHash ??
      session?.baselineVersionHash ??
      null;
    const timestamp = promotionResult
      ? expandedFitResult?.updatedAt ?? session?.updatedAt ?? null
      : null;
    if (!baselineVersionId && versionNumber == null && !baselineVersionHash) {
      return null;
    }

    return {
      baselineVersionId,
      versionNumber,
      baselineVersionHash,
      timestamp: formatTimestamp(timestamp),
    };
  }, [
    promotionResult?.baselineVersionHash,
    promotionResult?.baselineVersionId,
    promotionResult?.versionNumber,
    session?.promotedBaselineVersionId,
    session?.baselineVersionHash,
    session?.updatedAt,
    expandedFitResult?.promotedBaselineVersionId,
    expandedFitResult?.baselineVersionHash,
    expandedFitResult?.updatedAt,
  ]);

  const verdictFromScore = (score: number | null | undefined) => {
    if (score === null || score === undefined) return null;
    if (score >= 80) return "APPLY";
    if (score >= 60) return "CONSIDER";
    return "SKIP";
  };

  const originalVerdict = expandedFitDetails?.originalVerdict ?? verdictFromScore(expandedFitDetails?.originalScore);
  const expandedVerdict = expandedFitDetails?.expandedVerdict ?? verdictFromScore(expandedFitDetails?.expandedScore);

  const handleChange = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

const trimmedResponses = useMemo(
    () => answers.map((answer) => (answer ?? "").trim()),
    [answers],
  );

  const answeredCount = useMemo(
    () => trimmedResponses.filter((response) => response.length > 0).length,
    [trimmedResponses],
  );

  const handleSave = async () => {
    if (!sessionId) return;

    if (answeredCount === 0) {
      setError("Add at least one response before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveInterviewResponses(sessionId, trimmedResponses);
      setMessage("Responses saved. You can revisit this page anytime.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save responses.");
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (addition: RecommendedAddition, decision: RecommendedAdditionDecision) => {
    if (!sessionId || !addition?.id) return;

    setDecisionSavingId(addition.id);
    setError(null);
    setMessage(null);

    try {
      const updatedSession = await submitInterviewAdditionDecisions(sessionId, [
        { additionId: addition.id, decision },
      ]);
      applySessionUpdate(updatedSession, { preserveAnswers: true });
      setMessage("Decision saved.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to save decision.");
    } finally {
      setDecisionSavingId(null);
    }
  };

  const saveAcceptedAdditions = useCallback(
    async (nextAcceptedIds: string[]) => {
      if (!sessionId) return;

      setAcceptedSaving(true);
      setAcceptedError(null);
      setReviewMessage(null);

      try {
        const updatedSession = await updateInterviewAcceptedAdditions(
          sessionId,
          nextAcceptedIds,
        );
        applySessionUpdate(updatedSession, { preserveAnswers: true });
        setReviewMessage("Accepted additions updated.");
      } catch (saveError) {
        setAcceptedError(saveError instanceof Error ? saveError.message : "Unable to save accepted additions.");
      } finally {
        setAcceptedSaving(false);
      }
    },
    [applySessionUpdate, sessionId],
  );

  const handleAcceptedToggle = (additionId: string) => {
    setAcceptedAdditionIds((prev) => {
      const next = prev.includes(additionId) ? prev.filter((id) => id !== additionId) : [...prev, additionId];
      void saveAcceptedAdditions(next);
      return next;
    });
  };

  const handleRejectAll = async () => {
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(
            "Rejecting all additions will discard the progress you made in this interview. Continue?",
          )
        : true;
    if (!confirmed) {
      return;
    }
    setAcceptedAdditionIds([]);
    await saveAcceptedAdditions([]);
    setReviewMessage("All additions rejected. Interview completed.");
  };

  const handleRecomputeExpandedFit = async () => {
    if (!sessionId) return;

    setExpandedComputing(true);
    setExpandedComputeError(null);
    setReviewMessage(null);
    setLastComputeStatus("loading");

    try {
      const updatedSession = await computeInterviewExpandedFit(sessionId);
      const completedAt = new Date().toISOString();

      if (!updatedSession || !updatedSession.expandedFitAssessment) {
        throw new Error("Expanded fit computation did not return any data.");
      }

      const expandedScore = readNumericField(updatedSession.expandedFitAssessment, [
        "expandedScore",
        "expanded_score",
      ]);
      const hasScore = expandedScore !== null;

      applySessionUpdate(updatedSession, { preserveAnswers: true });
      setExpandedFitResult(updatedSession);
      setLastComputeStatus("success");
      setLastComputeAt(completedAt);
      setHasExpandedFitData(hasScore);

      if (hasScore) {
        setReviewMessage("Expanded fit score updated");
      }
    } catch (computeError) {
      const message =
        computeError instanceof Error ? computeError.message : "Unable to compute expanded fit.";
      setExpandedComputeError(message);
      setLastComputeStatus("error");
      setLastComputeAt(new Date().toISOString());
      setHasExpandedFitData(false);
    } finally {
      setExpandedComputing(false);
    }
  };

  const handlePromoteAcceptedAdditions = async () => {
    if (!sessionId) return;

    if (acceptedAdditionIds.length === 0) {
      setPromotionError("Select at least one addition to promote.");
      return;
    }

    if (!baselineAvailable) {
      setPromotionError("A linked baseline version is required before promoting additions.");
      return;
    }

    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(
            "Promoting accepted additions creates a new baseline version and overwrites the existing content. Continue?",
          )
        : true;
    if (!confirmed) {
      return;
    }

    setPromotionSaving(true);
    setPromotionError(null);
    setReviewMessage(null);

    try {
      const promotion = await promoteInterviewAcceptedAdditions(sessionId);
      const baselineVersionId = promotion.baselineVersionId ?? "";
      const baselineVersionHash = promotion.baselineVersionHash ?? null;

      if (baselineVersionId) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                promotedBaselineVersionId: baselineVersionId,
              }
            : prev,
        );
      }

      setPromotionResult(
        baselineVersionId
          ? {
              baselineVersionId,
              baselineVersionHash,
              versionNumber: promotion.versionNumber ?? null,
            }
          : null,
      );
      setReviewMessage("Accepted additions promoted to a new baseline version.");
    } catch (promoteError) {
      setPromotionError(
        promoteError instanceof Error ? promoteError.message : "Unable to promote additions.",
      );
    } finally {
      setPromotionSaving(false);
    }
  };

  const recommendationStats = useMemo(() => {
    return recommendedAdditions.reduce(
      (acc, addition) => {
        if (addition.status === "accepted") acc.accepted += 1;
        else if (addition.status === "rejected") acc.rejected += 1;
        else if (addition.status === "deferred") acc.deferred += 1;
        return acc;
      },
      { accepted: 0, rejected: 0, deferred: 0 },
    );
  }, [recommendedAdditions]);

  const backendIndicatesCompletion =
    typeof session?.status === "string" &&
    COMPLETION_STATUS_VALUES.includes(session.status.toLowerCase());
  const allQuestionsAnswered = questions.length > 0 && answeredCount >= questions.length;
  const interviewComplete = backendIndicatesCompletion || allQuestionsAnswered;
  const expandedFitComputed = Boolean(expandedFitDetails);
  const canPromote = baselineAvailable && expandedFitComputed && acceptedAdditionIds.length > 0;
  const analyzeBaselineVersionId =
    promotionResult?.baselineVersionId ??
    session?.promotedBaselineVersionId ??
    session?.baselineVersionId ??
    null;
  const analyzeUrl = analyzeBaselineVersionId
    ? `/analyze?baselineVersionId=${encodeURIComponent(analyzeBaselineVersionId)}`
    : "/analyze";
  const fitReviewUrl = session?.jobId
    ? `/fit-review?jobId=${encodeURIComponent(session.jobId)}`
    : "/fit-review";
  const completionReason = backendIndicatesCompletion
    ? "Backend marked this interview as complete."
    : allQuestionsAnswered
      ? "All questions now have recorded responses."
      : "Use the actions below to move forward.";


  return (
    <PageShell>
      <div className="space-y-6 pb-10">
        <PageHeader
          kicker="Interview session"
          title="Fit Review"
          description="Capture responses tied to each gap, review recommendations, and finish the baseline interview."
        />
        {baselineMissingForSession ? (
          <Alert intent="warning">
            This interview requires a linked baseline version. Upload or review your baseline in the{" "}
            <Link href="/baseline" className="text-sky-300 underline">
              baseline library
            </Link>{" "}
            before continuing.
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Session details</p>
              <h2 className="text-lg font-semibold text-slate-100">Interview prompts</h2>
            </div>
            {questions.length === 0 ? (
              <Alert intent="warning">No interview questions were generated for this session.</Alert>
            ) : (
              <div className="space-y-6">
                {questions.map((question, index) => {
                  const gap = gapMap.get(question.gapId);
                  const complianceFlags = complianceLookup.questions[index] ?? [];
                  return (
                    <div key={(question.prompt ?? index) + "-" + index} className="space-y-4">
                      <div className="space-y-3">
                        <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                          {question.prompt}
                        </label>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                          <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">
                            Category: {question.category}
                          </span>
                          <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">
                            Gap: {question.gapId}
                          </span>
                          {gap ? (
                            <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1">
                              Domain: {gap.domain} ? Confidence: {gap.confidence}
                            </span>
                          ) : null}
                        </div>
                        {gap ? (
                          <p className="text-xs text-slate-400">
                            JD excerpt: <em>{gap.jdExcerpt}</em>
                            {gap.baselineExcerpt ? (
                              <span className="text-xs text-slate-400"> | Baseline: <em>{gap.baselineExcerpt}</em></span>
                            ) : null}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-slate-400">Reason: Generated from gap {question.gapId}.</p>
                      </div>
                      <textarea
                        value={answers[index] ?? ""}
                        onChange={(event) => handleChange(index, event.target.value)}
                        className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-3 text-sm text-slate-100 outline-none focus:border-amber-400 focus:bg-white/10"
                        rows={6}
                      />
                      {complianceFlags.length ? (
                        <Alert intent="warning" title="Compliance checks">
                          <ul className="list-disc space-y-1 pl-4 text-xs text-slate-200">
                            {complianceFlags.map((flag, flagIndex) => (
                              <li key={(flag.code ?? flag.message ?? flagIndex) + "-" + flagIndex}>
                                {flag.code ? flag.code + ": " : ""}
                                {flag.message ?? "Flagged response"}
                                {flag.severity ? " (severity: " + flag.severity + ")" : ""}
                              </li>
                            ))}
                          </ul>
                        </Alert>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <FormButton onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save responses"}
              </FormButton>
              <span className="text-xs text-slate-400">Session ID: {sessionId}</span>
            </div>
            {message ? <Alert intent="success">{message}</Alert> : null}
            {error ? <Alert intent="error">{error}</Alert> : null}
          </section>

          <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Session</p>
              <h2 className="text-lg font-semibold text-slate-100">Overview</h2>
            </div>
            <div className="space-y-2 text-sm text-slate-200">
              <div>
                Status: <strong className="text-slate-100">{session?.status ?? "loading"}</strong>
              </div>
              <div className="text-slate-400">Baseline: {session?.baselineId ?? "..."}</div>
              {baselineVersionReference ? (
                <div className="text-slate-400">Baseline version reference: {baselineVersionReference}</div>
              ) : null}
              {promotedBaselineReference ? (
                <div className="text-slate-400">Promoted baseline version: {promotedBaselineReference}</div>
              ) : null}
              {session?.jobId ? <div className="text-slate-400">Job: {session.jobId}</div> : null}
              <div className="text-xs text-slate-400">
                Created: {session?.createdAt ? new Date(session.createdAt).toLocaleString() : "..."}
              </div>
              <div className="text-xs text-slate-400">
                Updated: {session?.updatedAt ? new Date(session.updatedAt).toLocaleString() : "..."}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Detected gaps</p>
                {gaps.length === 0 ? (
                  <Alert intent="warning">No gaps were returned for this interview.</Alert>
                ) : (
                  <div className="space-y-3">
                    {gaps.map((gap) => (
                      <div
                        key={gap.gapId}
                        className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                      >
                        <div className="flex flex-wrap gap-2 text-xs text-slate-100">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{gap.gapId}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Domain: {gap.domain}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Confidence: {gap.confidence}</span>
                        </div>
                        <p className="text-xs text-slate-400">JD: <em>{gap.jdExcerpt}</em></p>
                        {gap.baselineExcerpt ? (
                          <p className="text-xs text-slate-400">Baseline: <em>{gap.baselineExcerpt}</em></p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Recommendations</p>
                {recommendedAdditions.length === 0 ? (
                  <Alert intent="warning">No recommended additions for this interview.</Alert>
                ) : (
                  <div className="space-y-3">
                    {recommendedAdditions.map((addition, index) => {
                      const complianceFlags = complianceLookup.recommendations[index] ?? [];
                      const acceptBlocked = complianceFlags.length > 0;
                      const isSavingDecision = decisionSavingId === addition.id;
                      const status = addition.status;
                      const statusColors =
                        status === "accepted"
                          ? "text-emerald-200 bg-emerald-500/10"
                          : status === "rejected"
                            ? "text-rose-200 bg-rose-500/10"
                            : status === "deferred"
                              ? "text-amber-200 bg-amber-500/10"
                              : "text-slate-200 bg-white/5";
                      return (
                        <div
                          key={(addition.id ?? addition.text) + "-" + index}
                          className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-slate-100">{addition.text || addition.id}</p>
                            <span
                              className={
                                "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] " +
                                statusColors
                              }
                            >
                              {isSavingDecision ? "Saving..." : status ?? "Proposed"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <FormButton
                              variant="ghost"
                              className="px-3 py-1 text-xs"
                              onClick={() => handleDecision(addition, "accept")}
                              disabled={acceptBlocked || isSavingDecision}
                            >
                              Accept
                            </FormButton>
                            <FormButton
                              variant="secondary"
                              className="px-3 py-1 text-xs"
                              onClick={() => handleDecision(addition, "reject")}
                              disabled={isSavingDecision}
                            >
                              Reject
                            </FormButton>
                            <FormButton
                              variant="ghost"
                              className="px-3 py-1 text-xs"
                              onClick={() => handleDecision(addition, "defer")}
                              disabled={isSavingDecision}
                            >
                              Defer
                            </FormButton>
                          </div>
                          {complianceFlags.length ? (
                            <Alert intent="warning" title="Compliance flags">
                              <ul className="list-disc space-y-1 pl-4 text-xs text-slate-200">
                                {complianceFlags.map((flag, flagIndex) => (
                                  <li key={(flag.code ?? flag.message ?? flagIndex) + "-" + flagIndex}>
                                    {flag.code ? flag.code + ": " : ""}
                                    {flag.message ?? "Flagged recommendation"}
                                    {flag.severity ? " (severity: " + flag.severity + ")" : ""}
                                  </li>
                                ))}
                              </ul>
                            </Alert>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Completion</p>
                <div className="grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                  <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-400">Detected gaps</p>
                    <p className="text-2xl font-bold text-white">{gaps.length}</p>
                  </div>
                  <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-400">Questions answered</p>
                    <p className="text-2xl font-bold text-white">{answeredCount} / {questions.length}</p>
                  </div>
                  <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
                    <p className="text-xs text-slate-400">Recommendations</p>
                    <p className="text-sm text-slate-200">
                      Accepted: <strong>{recommendationStats.accepted}</strong>
                      <br />
                      Rejected: <strong>{recommendationStats.rejected}</strong>
                      <br />
                      Deferred: <strong>{recommendationStats.deferred}</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Verified additions</p>
                  <h3 className="text-lg font-semibold text-slate-100">Review verified additions</h3>
                </div>
                {recommendedAdditions.length === 0 ? (
                  <Alert intent="warning">No verified additions to review. This interview is complete.</Alert>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                      {expandedFitDetails ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 text-sm text-slate-200 md:grid-cols-3">
                            <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                              <p className="text-xs text-slate-400">Original score</p>
                              <p className="text-xl font-bold text-white">
                                {expandedFitDetails.originalScore ?? "-"}
                              </p>
                              <p className="text-xs text-slate-400">Verdict: {originalVerdict ?? "Unknown"}</p>
                            </div>
                            <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                              <p className="text-xs text-slate-400">Expanded score</p>
                              <p className="text-xl font-bold text-white">
                                {expandedFitDetails.expandedScore ?? "-"}
                              </p>
                              <p className="text-xs text-slate-400">Verdict: {expandedVerdict ?? "Unknown"}</p>
                            </div>
                            <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                              <p className="text-xs text-slate-400">Delta</p>
                              <p className="text-xl font-bold text-white">
                                {expandedFitDetails.delta !== null && expandedFitDetails.delta !== undefined
                                  ? (expandedFitDetails.delta >= 0 ? "+" : "") + expandedFitDetails.delta
                                  : "-"}
                              </p>
                            </div>
                          </div>
                          {expandedDimensionBreakdown ? (
                            <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                                Dimension breakdown
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {expandedDimensionBreakdown.map((entry) => (
                                  <div
                                    key={entry.dimension}
                                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs text-slate-200"
                                  >
                                    <span>{entry.label}</span>
                                    <span className="font-semibold text-slate-100">{entry.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {expandedFitMetadata ? (
                            <div className="space-y-1 rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-200">
                              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                                Expanded fit metadata
                              </p>
                              {expandedFitMetadata.baselineName ? (
                                <p className="text-sm text-slate-100">
                                  Baseline: {expandedFitMetadata.baselineName}
                                </p>
                              ) : null}
                              {expandedFitMetadata.baselineVersionId ? (
                                <p>
                                  <span className="text-xs text-slate-400">Version: </span>
                                  <span className="text-sm text-slate-100">
                                    {expandedFitMetadata.baselineVersionId}
                                    {expandedFitMetadata.baselineVersionNumber != null
                                      ? " (v" + expandedFitMetadata.baselineVersionNumber + ")"
                                      : ""}
                                    {expandedFitMetadata.baselineVersionHash
                                      ? " (" + expandedFitMetadata.baselineVersionHash + ")"
                                      : ""}
                                  </span>
                                </p>
                              ) : null}
                              {expandedFitMetadata.computedAt ? (
                                <p className="text-xs text-slate-400">
                                  Computed at: {expandedFitMetadata.computedAt}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {promotedBaselineMetadata ? (
                            <div className="space-y-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-slate-200">
                              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
                                Promoted baseline
                              </p>
                              {promotedBaselineMetadata.baselineVersionId ? (
                                <p className="text-sm text-white">
                                  {promotedBaselineMetadata.baselineVersionId}
                                  {promotedBaselineMetadata.versionNumber != null
                                    ? " (v" + promotedBaselineMetadata.versionNumber + ")"
                                    : ""}
                                  {promotedBaselineMetadata.baselineVersionHash
                                    ? " (" + promotedBaselineMetadata.baselineVersionHash + ")"
                                    : ""}
                                </p>
                              ) : null}
                              {promotedBaselineMetadata.timestamp ? (
                                <p className="text-xs text-slate-300">
                                  Promoted at: {promotedBaselineMetadata.timestamp}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <Alert intent="warning">Expanded fit has not been computed for this interview yet.</Alert>
                      )}
                      <FormButton
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        onClick={handleRecomputeExpandedFit}
                        disabled={expandedComputing || !sessionId}
                      >
                        {expandedComputing ? "Recomputing..." : "Recompute expanded score"}
                      </FormButton>
                      {debugUiEnabled ? (
                        <div className="space-y-1 rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Debug</p>
                          <p>lastComputeStatus: {lastComputeStatus}</p>
                          <p>lastComputeAt: {lastComputeAt ?? "never"}</p>
                          <p>hasExpandedFitData: {hasExpandedFitData ? "true" : "false"}</p>
                        </div>
                      ) : null}
                      {expandedComputeError ? (
                        <p className="text-xs text-rose-300">Unable to compute expanded fit: {expandedComputeError}</p>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-400">
                      Accepted additions: {acceptedAdditions.length} / {recommendedAdditions.length}
                    </p>
                    <div className="space-y-3">
                      {recommendedAdditions.map((addition, index) => (
                        <div
                          key={(addition.id ?? addition.text) + "-" + index}
                          className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/60 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-xs text-slate-200">
                              <input
                                type="checkbox"
                                checked={acceptedAdditionSet.has(addition.id)}
                                onChange={() => handleAcceptedToggle(addition.id)}
                                className="h-4 w-4 rounded border border-white/30 bg-slate-900"
                              />
                              Accept
                            </label>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200">
                              {describeAdditionSource(addition)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-100">{addition.text || addition.id}</p>
                        </div>
                      ))}
                    </div>
                    {acceptedSaving ? <p className="text-xs text-slate-400">Saving accepted additions...</p> : null}
                    {acceptedError ? <Alert intent="error">{acceptedError}</Alert> : null}
                    {promotionError ? <Alert intent="error">{promotionError}</Alert> : null}
                    {reviewMessage ? <Alert intent="success">{reviewMessage}</Alert> : null}
                    {promotionResult ? (
                      <Alert intent="success">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-slate-100">
                            New baseline version: {promotionResult.baselineVersionId ?? "unknown"}
                            {promotionResult.versionNumber != null ? " (v" + promotionResult.versionNumber + ")" : ""}
                            {promotionResult.baselineVersionHash ? " (" + promotionResult.baselineVersionHash + ")" : ""}
                          </p>
                          <div className="flex flex-wrap gap-3">
                            <Link href="/baseline" className="text-xs text-sky-300 underline">
                              Open baseline library
                            </Link>
                            {promotionResult.baselineVersionId ? (
                              <>
                                <Link
                                  href={"/analyze?baselineVersionId=" + encodeURIComponent(promotionResult.baselineVersionId)}
                                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200"
                                >
                                  Analyze with new baseline
                                </Link>
                                <Link
                                  href={"/fit-review?baselineVersionId=" + encodeURIComponent(promotionResult.baselineVersionId)}
                                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200"
                                >
                                  Continue to Fit Review
                                </Link>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </Alert>
                    ) : null}
                  </div>
                )}
                {interviewComplete ? (
                  <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                    <Alert intent="success">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-100">Interview complete</p>
                        <p className="text-xs text-slate-300">{completionReason}</p>
                      </div>
                    </Alert>
                    <div className="text-xs text-slate-400">
                      {acceptedAdditionIds.length === 0 ? (
                        <p>No accepted additions yet; accept recommendations to unlock promotion.</p>
                      ) : null}
                      {!expandedFitComputed ? (
                        <p>Recompute the expanded fit score before promoting additions.</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <FormButton
                        onClick={handlePromoteAcceptedAdditions}
                        disabled={promotionSaving || !canPromote}
                      >
                        {promotionSaving ? "Promoting..." : "Promote accepted additions to baseline"}
                      </FormButton>
                      <FormButton
                        variant="secondary"
                        onClick={handleRejectAll}
                        disabled={acceptedSaving || promotionSaving}
                      >
                        Reject all and finish
                      </FormButton>
                      <Link
                        href={analyzeUrl}
                        className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200"
                      >
                        Analyze with baseline
                      </Link>
                      <FormButton variant="ghost" onClick={() => router.push(fitReviewUrl)}>
                        Return to Fit Review
                      </FormButton>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/results"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-semibold text-slate-900"
              >
                Continue
              </Link>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

