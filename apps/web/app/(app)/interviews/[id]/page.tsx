"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { ComplianceViolationPanel } from "@/components/ComplianceViolationPanel";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TierGateNotice } from "@/components/TierGateNotice";
import type {
  InterviewAcceptedAddition,
  InterviewGap,
  InterviewQuestion,
  InterviewSessionDto,
  RecommendedAddition,
  RecommendedAdditionDecision,
} from "@/lib/interviews";
import {
  acceptInterviewAddition,
  computeInterviewExpandedFit,
  fetchInterviewAcceptedAdditions,
  fetchInterviewRecommendedAdditions,
  promoteInterviewAcceptedAdditions,
  saveInterviewResponses,
  submitInterviewAdditionDecisions,
  updateInterviewAcceptedAdditions,
} from "@/lib/interviewsClient";
import type { AcceptInterviewAdditionPayload } from "@/lib/interviewsClient";
import type {
  InterviewExpandedFitResponse,
  InterviewPromotionResponse,
} from "@/lib/interviewsClient";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";

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

type InterviewLoadStatus =
  | "idle"
  | "loading"
  | "success"
  | "not-found"
  | "tier-gate"
  | "compliance"
  | "error";

function normalizeCompliance(
  validationResults?: Record<string, unknown>,
): ComplianceLookup {
  const lookup: ComplianceLookup = { general: [], questions: {}, recommendations: {} };
  if (!validationResults) return lookup;

  const rawFlags =
    (validationResults as { complianceFlags?: unknown; compliance_flags?: unknown })
      .complianceFlags ??
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

    if (
      normalized.recommendationIndex !== undefined &&
      normalized.recommendationIndex >= 0
    ) {
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
    if (typeof source.questionIndex === "number")
      labels.push(`Question ${source.questionIndex + 1}`);
    if (source.questionPrompt) labels.push(`Prompt: ${source.questionPrompt}`);
  });

  if (!labels.length) return "General addition";

  return labels.slice(0, 2).join(" | ");
}

const COMPLETION_STATUS_VALUES = ["complete", "completed", "done", "closed", "finished"];

type ComputeStatus = "idle" | "loading" | "success" | "error";

const debugUiEnabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";
const isDevEnvironment =
  typeof process !== "undefined" && process.env.NODE_ENV !== "production";

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;
  const [session, setSession] = useState<InterviewSessionDto | null>(null);
  const [loadStatus, setLoadStatus] = useState<InterviewLoadStatus>("idle");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [tierGateError, setTierGateError] = useState<TierGateError | null>(null);
  const [loadComplianceError, setLoadComplianceError] =
    useState<ParsedComplianceError | null>(null);
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
  const [lastComputeStatus, setLastComputeStatus] = useState<ComputeStatus>("idle");
  const [lastComputeAt, setLastComputeAt] = useState<string | null>(null);
  const [hasExpandedFitData, setHasExpandedFitData] = useState(false);
  const [expandedFitResult, setExpandedFitResult] =
    useState<InterviewExpandedFitResponse | null>(null);
  const [promotionSaving, setPromotionSaving] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [promotionResult, setPromotionResult] = useState<InterviewPromotionResponse | null>(
    null,
  );
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [recommendedAdditionsState, setRecommendedAdditionsState] = useState<
    RecommendedAddition[]
  >([]);
  const [recommendedFetchStatus, setRecommendedFetchStatus] =
    useState<ComputeStatus>("idle");
  const [recommendedFetchError, setRecommendedFetchError] = useState<string | null>(
    null,
  );
  const [persistedAcceptedAdditions, setPersistedAcceptedAdditions] = useState<
    InterviewAcceptedAddition[]
  >([]);
  const [acceptedFetchStatus, setAcceptedFetchStatus] = useState<ComputeStatus>("idle");
  const [acceptedFetchError, setAcceptedFetchError] = useState<string | null>(null);
  const [acceptingAdditionId, setAcceptingAdditionId] = useState<string | null>(null);

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
        return Array.from(
          { length: questionCount },
          (_, index) => existingResponses[index] ?? "",
        );
      });
    },
    [],
  );

  // Moved up: this must be declared before any callbacks that reference it.
  const saveAcceptedAdditions = useCallback(
    async (nextAcceptedIds: string[]) => {
      if (!sessionId) return;

      setAcceptedSaving(true);
      setAcceptedError(null);
      setReviewMessage(null);

      try {
        const updatedSession = await updateInterviewAcceptedAdditions(sessionId, nextAcceptedIds);
        applySessionUpdate(updatedSession, { preserveAnswers: true });
        setReviewMessage("Accepted additions updated.");
      } catch (saveError) {
        setAcceptedError(
          saveError instanceof Error ? saveError.message : "Unable to save accepted additions.",
        );
      } finally {
        setAcceptedSaving(false);
      }
    },
    [applySessionUpdate, sessionId],
  );

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setLoadStatus("not-found");
      setLoadMessage("Interview identifier is missing.");
      return;
    }

    let cancelled = false;
    const path = `/api/interviews/${encodeURIComponent(sessionId)}`;

    const loadSession = async () => {
      setLoadStatus("loading");
      setLoadMessage(null);
      setTierGateError(null);
      setLoadComplianceError(null);
      setSession(null);
      setError(null);

      try {
        const response = await fetch(path, { cache: "no-store" });
        const payload = await readResponsePayload(response);

        if (!response.ok) {
          const tierGate = parseTierGateError({ status: response.status, payload });
          if (tierGate) {
            if (!cancelled) {
              setTierGateError(tierGate);
              setLoadStatus("tier-gate");
            }
            return;
          }

          const compliance = parseComplianceError({ status: response.status, payload });
          if (compliance) {
            if (!cancelled) {
              setLoadComplianceError(compliance);
              setLoadStatus("compliance");
            }
            return;
          }

          const message = formatErrorMessage(payload, "Unable to load interview session.");
          if (!cancelled) {
            if (response.status === 404) {
              setLoadStatus("not-found");
              setLoadMessage("Interview not found.");
            } else {
              setLoadStatus("error");
              setLoadMessage(message);
            }
          }

          if (isDevEnvironment) {
            console.error("Interview load failed", {
              sessionId,
              status: response.status,
              payload,
            });
          }

          return;
        }

        if (!cancelled) {
          applySessionUpdate(payload as InterviewSessionDto);
          setLoadStatus("success");
        }
      } catch (loadError) {
        if (cancelled) return;
        const message =
          loadError instanceof Error ? loadError.message : "Unable to load interview session.";
        setLoadStatus("error");
        setLoadMessage(message);
        setError(message);
        if (isDevEnvironment) {
          console.error("Interview load error", { sessionId, error: loadError });
        }
      }
    };

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId, applySessionUpdate, debugUiEnabled]);

  useEffect(() => {
    setAcceptedAdditionIds(session?.acceptedAdditionIds ?? []);
  }, [session?.acceptedAdditionIds]);

  useEffect(() => {
    if (!session?.expandedFitAssessment) {
      setExpandedFitResult(null);
    }
  }, [session?.expandedFitAssessment]);

  useEffect(() => {
    if (!sessionId || loadStatus !== "success") {
      if (loadStatus !== "success") {
        setRecommendedFetchStatus("idle");
        setRecommendedAdditionsState([]);
      }
      return;
    }

    let cancelled = false;
    setRecommendedFetchStatus("loading");
    setRecommendedFetchError(null);

    fetchInterviewRecommendedAdditions(sessionId)
      .then((payload) => {
        if (cancelled) return;
        setRecommendedAdditionsState(payload);
        setRecommendedFetchStatus("success");
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setRecommendedFetchStatus("error");
        setRecommendedFetchError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load recommended additions.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, loadStatus]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancelled = false;
    setAcceptedFetchStatus("loading");
    setAcceptedFetchError(null);

    fetchInterviewAcceptedAdditions(sessionId)
      .then((payload) => {
        if (cancelled) return;
        setPersistedAcceptedAdditions(payload);
        setAcceptedFetchStatus("success");
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setAcceptedFetchStatus("error");
        setAcceptedFetchError(
          fetchError instanceof Error ? fetchError.message : "Unable to load accepted additions.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const questions: InterviewQuestion[] = useMemo(
    () => session?.questions ?? [],
    [session?.questions],
  );
  const gaps: InterviewGap[] = useMemo(() => session?.gapList ?? [], [session?.gapList]);
  const acceptedRecommendationIds = useMemo(() => {
    const set = new Set<string>();
    persistedAcceptedAdditions.forEach((addition) => {
      if (addition.recommendedAdditionId) {
        set.add(addition.recommendedAdditionId);
      }
    });
    acceptedAdditionIds.forEach((id) => set.add(id));
    return set;
  }, [persistedAcceptedAdditions, acceptedAdditionIds]);
  const recommendedAdditions = useMemo(() => {
    return recommendedAdditionsState.map((addition) => ({
      ...addition,
      status: acceptedRecommendationIds.has(addition.id)
        ? "accepted"
        : addition.status ?? "proposed",
    }));
  }, [recommendedAdditionsState, acceptedRecommendationIds]);
  const acceptedAdditionSet = useMemo(() => new Set(acceptedAdditionIds), [acceptedAdditionIds]);
  const acceptedRecommendedAdditions = useMemo(
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

  const recommendedAdditionsByGap = useMemo(() => {
    const map = new Map<string, RecommendedAddition[]>();
    recommendedAdditions.forEach((addition) => {
      const gapId = addition.sources?.find((source) => source?.gapId)?.gapId ?? addition.id;
      const existing = map.get(gapId) ?? [];
      existing.push(addition);
      map.set(gapId, existing);
    });
    return map;
  }, [recommendedAdditions]);

  const handleAcceptAddition = useCallback(
    async (addition: RecommendedAddition) => {
      if (!sessionId || !addition?.id) return;

      setAcceptingAdditionId(addition.id);
      setRecommendedFetchError(null);

      const fallbackGapId = gaps[0]?.gapId ?? addition.id ?? "";
      const gapId = addition.sources?.find((source) => source?.gapId)?.gapId ?? fallbackGapId;

      if (!gapId) {
        setRecommendedFetchError("Unable to determine the gap for this addition.");
        setAcceptingAdditionId(null);
        return;
      }

      const gap = gapMap.get(gapId);
      const payload: AcceptInterviewAdditionPayload = {
        gapId,
        suggestion: addition.text,
        recommendedAdditionId: addition.id,
      };

      if (gap?.domain) {
        payload.domain = gap.domain;
      }

      try {
        const record = await acceptInterviewAddition(sessionId, payload);
        setPersistedAcceptedAdditions((prev) => [
          ...prev.filter((entry) => entry.id !== record.id),
          record,
        ]);
        const nextAcceptedIds = Array.from(new Set([...acceptedAdditionIds, addition.id]));
        setAcceptedAdditionIds(nextAcceptedIds);
        await saveAcceptedAdditions(nextAcceptedIds);
      } catch (acceptError) {
        const message =
          acceptError instanceof Error ? acceptError.message : "Unable to accept addition.";
        setRecommendedFetchError(message);
      } finally {
        setAcceptingAdditionId(null);
      }
    },
    [sessionId, acceptedAdditionIds, saveAcceptedAdditions, gapMap, gaps],
  );

  const baselineVersionHash = useMemo(() => {
    if (typeof session?.baselineVersionHash === "string") return session.baselineVersionHash;

    const validation =
      session?.validationResults && typeof session.validationResults === "object"
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
    const hash = promotionResult?.baselineVersionHash ?? expandedFitResult?.baselineVersionHash ?? null;
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
        (entry): entry is { dimension: string; label: string; value: number } =>
          entry.value !== null,
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
      (typeof expandedFitSession.baselineVersion === "number" ? expandedFitSession.baselineVersion : null);

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
    const timestamp = promotionResult ? expandedFitResult?.updatedAt ?? session?.updatedAt ?? null : null;
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

  const originalVerdict =
    expandedFitDetails?.originalVerdict ?? verdictFromScore(expandedFitDetails?.originalScore);
  const expandedVerdict =
    expandedFitDetails?.expandedVerdict ?? verdictFromScore(expandedFitDetails?.expandedScore);

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
      const updatedSession = await saveInterviewResponses(sessionId, trimmedResponses);
      applySessionUpdate(updatedSession, { preserveAnswers: true });
      setMessage("Responses saved. You can revisit this page anytime.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save responses.");
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (
    addition: RecommendedAddition,
    decision: RecommendedAdditionDecision,
  ) => {
    if (!sessionId || !addition?.id) return;

    setDecisionSavingId(addition.id);
    setError(null);
    setMessage(null);

    try {
      const updatedSession = await submitInterviewAdditionDecisions(sessionId, [
        { additionId: addition.id, decision },
      ]);
      applySessionUpdate(updatedSession, { preserveAnswers: true });
      setRecommendedAdditionsState((prev) =>
        prev.map((entry) =>
          entry.id === addition.id
            ? {
                ...entry,
                status:
                  decision === "accept"
                    ? "accepted"
                    : decision === "reject"
                      ? "rejected"
                      : "deferred",
              }
            : entry,
        ),
      );
      setMessage("Decision saved.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to save decision.");
    } finally {
      setDecisionSavingId(null);
    }
  };

  const handleAcceptedToggle = (additionId: string) => {
    setAcceptedAdditionIds((prev) => {
      const next = prev.includes(additionId)
        ? prev.filter((id) => id !== additionId)
        : [...prev, additionId];
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
  const loopSteps = [
    {
      key: "responses",
      label: "1. Save responses",
      complete: allQuestionsAnswered,
    },
    {
      key: "decisions",
      label: "2. Validate additions",
      complete: acceptedAdditionIds.length > 0,
    },
    {
      key: "expandedFit",
      label: "3. Compute expanded fit",
      complete: expandedFitComputed,
    },
    {
      key: "promotion",
      label: "4. Promote baseline",
      complete: Boolean(promotedBaselineReference),
    },
  ] as const;

  return (
    <PageShell>
      <div className="space-y-6 pb-10">
        <PageHeader
          kicker="Interview session"
          title="Baseline Expansion Interview"
          description="Capture evidence, validate additions, compute expanded fit, and promote your next baseline version."
        />
        {baselineMissingForSession ? (
          <Alert intent="warning">
            This interview requires a linked baseline version. Upload or review your baseline in
            the{" "}
            <Link href="/baseline" className="text-sky-300 underline">
              baseline library
            </Link>{" "}
            before continuing.
          </Alert>
        ) : null}

        {tierGateError ? <TierGateNotice error={tierGateError} /> : null}
        {loadComplianceError?.type === "insufficient_extracted_text" ? (
          <InsufficientExtractedText error={loadComplianceError} />
        ) : loadComplianceError ? (
          <ComplianceViolationPanel error={loadComplianceError} />
        ) : null}
        {loadStatus === "error" && loadMessage ? (
          <Alert intent="error" title="Unable to load interview">
            {loadMessage}
          </Alert>
        ) : null}
        {loadStatus === "not-found" ? (
          <EmptyState
            title="Interview not found"
            body={loadMessage ?? "We couldn't find that interview. Head back to Results to try again."}
            cta={
              <div className="flex flex-wrap gap-3">
                <FormButton onClick={() => router.push("/results")}>Back to Results</FormButton>
                <FormButton variant="secondary" onClick={() => router.push("/job-tracker")}>
                  Back to Application Tracker
                </FormButton>
              </div>
            }
            className="max-w-xl border border-white/10 bg-transparent px-4 py-6 shadow-none text-slate-400"
          />
        ) : null}

        {loadStatus === "success" ? (
          <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
            <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Session details
                </p>
                <h2 className="text-lg font-semibold text-slate-100">Interview questions and evidence</h2>
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Recommended additions
                  </p>
                  <h3 className="text-lg font-semibold text-slate-100">Validated additions to review</h3>
                </div>
                {recommendedFetchStatus === "loading" ? (
                  <Alert intent="info">Loading recommended additions...</Alert>
                ) : null}
                {recommendedFetchStatus === "error" && recommendedFetchError ? (
                  <Alert intent="error">{recommendedFetchError}</Alert>
                ) : null}
                {acceptedFetchError ? <Alert intent="error">{acceptedFetchError}</Alert> : null}
                {recommendedFetchStatus === "success" ? (
                  recommendedAdditions.length === 0 ? (
                    <Alert intent="warning">No recommended additions were generated for this interview.</Alert>
                  ) : (
                    <div className="space-y-3">
                      {Array.from(recommendedAdditionsByGap.entries()).map(([gapId, additions]) => {
                        const gap = gapMap.get(gapId);
                        return (
                          <div
                            key={gapId}
                            className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                          >
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                                  {gap ? `Gap ${gap.gapId}` : `Gap ${gapId}`}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {gap ? `Domain: ${gap.domain}` : "General addition"}
                                </p>
                              </div>
                              <span className="text-xs text-slate-400">
                                {additions.length} suggestion{additions.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="space-y-3">
                              {additions.map((addition) => {
                                const isAccepted = acceptedRecommendationIds.has(addition.id);
                                const isAccepting = acceptingAdditionId === addition.id;
                                const statusColors = isAccepted
                                  ? "text-emerald-200 bg-emerald-500/10"
                                  : addition.status === "rejected"
                                    ? "text-rose-200 bg-rose-500/10"
                                    : addition.status === "deferred"
                                      ? "text-amber-200 bg-amber-500/10"
                                      : "text-slate-200 bg-white/5";
                                return (
                                  <div
                                    key={addition.id}
                                    className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/60 p-3"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm text-slate-100">{addition.text}</p>
                                      <span
                                        className={
                                          "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] " +
                                          statusColors
                                        }
                                      >
                                        {isAccepted ? "Accepted" : isAccepting ? "Accepting..." : addition.status ?? "Proposed"}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <FormButton
                                        variant="ghost"
                                        className="px-3 py-1 text-xs"
                                        onClick={() => handleAcceptAddition(addition)}
                                        disabled={isAccepted || isAccepting}
                                      >
                                        {isAccepted ? "Accepted" : "Accept"}
                                      </FormButton>
                                    </div>
                                    <p className="text-xs text-slate-400">{describeAdditionSource(addition)}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : null}
                <p className="text-xs text-slate-400">
                  Accepted additions recorded: {persistedAcceptedAdditions.length}
                </p>
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
                                <span className="text-xs text-slate-400">
                                  {" "}
                                  | Baseline: <em>{gap.baselineExcerpt}</em>
                                </span>
                              ) : null}
                            </p>
                          ) : null}
                          <p className="text-[11px] text-slate-400">
                            Reason: Generated from gap {question.gapId}.
                          </p>
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
                  {saving ? "Saving..." : "Step 1: Save responses"}
                </FormButton>
                <span className="text-xs text-slate-400">Session ID: {sessionId}</span>
              </div>
              {message ? <Alert intent="success">{message}</Alert> : null}
              {error ? <Alert intent="error">{error}</Alert> : null}
            </section>

            <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Loop progress
                </p>
                <h3 className="text-lg font-semibold text-slate-100">Completion status</h3>
                <p className="text-sm text-slate-300">{completionReason}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {loopSteps.map((step) => (
                    <span
                      key={step.key}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        step.complete
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                          : "border-white/20 bg-white/5 text-slate-300"
                      }`}
                    >
                      {step.complete ? "Done" : "Next"} • {step.label}
                    </span>
                  ))}
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li>Responses answered: {answeredCount}/{questions.length}</li>
                  <li>Accepted recommendations: {acceptedAdditionIds.length}</li>
                  <li>Decision counts: accepted {recommendationStats.accepted}, rejected {recommendationStats.rejected}, deferred {recommendationStats.deferred}</li>
                  <li>Baseline version: {baselineVersionReference ?? "Unavailable"}</li>
                </ul>
              </div>

              {reviewMessage ? <Alert intent="success">{reviewMessage}</Alert> : null}
              {acceptedError ? <Alert intent="error">{acceptedError}</Alert> : null}
              {expandedComputeError ? <Alert intent="error">{expandedComputeError}</Alert> : null}
              {promotionError ? <Alert intent="error">{promotionError}</Alert> : null}

              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Step 2 • Validate additions
                </p>
                {recommendedAdditions.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Save responses to generate recommendations before recording decisions.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {recommendedAdditions.slice(0, 5).map((addition) => {
                      const isSavingDecision = decisionSavingId === addition.id;
                      const checked = acceptedAdditionSet.has(addition.id);
                      return (
                        <div key={addition.id} className="space-y-2 rounded-xl border border-white/10 p-3">
                          <p className="text-sm text-slate-100">{addition.text}</p>
                          <div className="flex flex-wrap gap-2">
                            <FormButton
                              variant="ghost"
                              className="px-2 py-1 text-xs"
                              disabled={isSavingDecision}
                              onClick={() => handleDecision(addition, "accept")}
                            >
                              {isSavingDecision ? "Saving..." : "Accept"}
                            </FormButton>
                            <FormButton
                              variant="ghost"
                              className="px-2 py-1 text-xs"
                              disabled={isSavingDecision}
                              onClick={() => handleDecision(addition, "reject")}
                            >
                              Reject
                            </FormButton>
                            <FormButton
                              variant="ghost"
                              className="px-2 py-1 text-xs"
                              disabled={isSavingDecision}
                              onClick={() => handleDecision(addition, "defer")}
                            >
                              Defer
                            </FormButton>
                            <label className="inline-flex items-center gap-2 rounded-full border border-white/10 px-2 py-1 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                className="h-3 w-3"
                                checked={checked}
                                disabled={acceptedSaving}
                                onChange={() => handleAcceptedToggle(addition.id)}
                              />
                              Include for promotion
                            </label>
                          </div>
                        </div>
                      );
                    })}
                    {recommendedAdditions.length > 5 ? (
                      <p className="text-xs text-slate-400">
                        Showing 5 of {recommendedAdditions.length} additions.
                      </p>
                    ) : null}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <FormButton variant="ghost" onClick={handleRejectAll} disabled={acceptedSaving}>
                    Reject all
                  </FormButton>
                  <span className="text-xs text-slate-400">
                    {acceptedSaving ? "Saving selection..." : "Selection synced to interview record."}
                  </span>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Step 3 • Expanded fit
                </p>
                {expandedFitDetails ? (
                  <div className="space-y-2 text-sm text-slate-200">
                    <p>Original score: {expandedFitDetails.originalScore ?? "n/a"} ({originalVerdict ?? "n/a"})</p>
                    <p>Expanded score: {expandedFitDetails.expandedScore ?? "n/a"} ({expandedVerdict ?? "n/a"})</p>
                    <p>Delta: {expandedFitDetails.delta ?? "n/a"}</p>
                    {expandedFitMetadata?.computedAt ? (
                      <p className="text-xs text-slate-400">Computed at: {expandedFitMetadata.computedAt}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Compute expanded fit after accepting validated additions.
                  </p>
                )}
                <FormButton
                  onClick={handleRecomputeExpandedFit}
                  disabled={expandedComputing || persistedAcceptedAdditions.length === 0}
                >
                  {expandedComputing ? "Computing..." : "Compute expanded fit now"}
                </FormButton>
                {expandedDimensionBreakdown?.length ? (
                  <ul className="space-y-1 text-xs text-slate-300">
                    {expandedDimensionBreakdown.slice(0, 4).map((entry) => (
                      <li key={entry.dimension}>
                        {entry.label}: {entry.value}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-slate-400">
                  Last compute: {lastComputeAt ? formatTimestamp(lastComputeAt) ?? "n/a" : "not run"} ({lastComputeStatus})
                </p>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Step 4 • Promote baseline
                </p>
                <p className="text-sm text-slate-300">
                  Promote accepted additions into a new baseline version when expanded fit is ready.
                </p>
                <FormButton
                  onClick={handlePromoteAcceptedAdditions}
                  disabled={promotionSaving || !canPromote}
                >
                  {promotionSaving ? "Promoting..." : "Promote accepted additions to baseline"}
                </FormButton>
                {promotedBaselineReference ? (
                  <Alert intent="success" title="Promotion complete">
                    New baseline version is ready: {promotedBaselineReference}
                  </Alert>
                ) : null}
                {promotedBaselineMetadata ? (
                  <ul className="space-y-1 text-xs text-slate-300">
                    <li>Baseline version id: {promotedBaselineMetadata.baselineVersionId ?? "n/a"}</li>
                    <li>Version number: {promotedBaselineMetadata.versionNumber ?? "n/a"}</li>
                    <li>Hash: {promotedBaselineMetadata.baselineVersionHash ?? "n/a"}</li>
                    <li>Updated: {promotedBaselineMetadata.timestamp ?? "n/a"}</li>
                  </ul>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link href={analyzeUrl} className="text-xs text-sky-300 underline">
                    Re-run Fit Review analysis
                  </Link>
                  <Link href={fitReviewUrl} className="text-xs text-sky-300 underline">
                    Back to Fit Review
                  </Link>
                  <Link href="/studio" className="text-xs text-sky-300 underline">
                    Open Studio for documents
                  </Link>
                  <Link href="/job-tracker" className="text-xs text-sky-300 underline">
                    Open Application Tracker
                  </Link>
                </div>
                {interviewComplete ? (
                  <p className="text-xs text-emerald-300">
                    Interview completion criteria met. You can now move directly to promotion and refreshed analysis.
                  </p>
                ) : null}
                {hasExpandedFitData ? (
                  <p className="text-xs text-slate-300">Expanded fit result is available for this interview.</p>
                ) : null}
                {acceptedRecommendedAdditions.length > 0 ? (
                  <p className="text-xs text-slate-400">
                    Accepted additions selected for promotion: {acceptedRecommendedAdditions.length}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
