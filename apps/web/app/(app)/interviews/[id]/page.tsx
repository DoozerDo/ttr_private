"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  buildWorkflowRequestKey,
  isWorkflowRequestStale,
  logWorkflowRequestEvent,
  type WorkflowRequestScope,
} from "@/lib/workflowRequestGuard";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";
import { mapGapToUserGuidance } from "@/lib/userGuidance";
import { publishBaselineUpdated } from "@/src/lib/baseline-sync";
import { InterviewApiError } from "@/lib/interviewsClient";
import {
  sanitizeRenderedTextList,
  sanitizeRenderedTextValue,
  type RenderedTextSource,
} from "@/lib/renderedText";

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

function sanitizeInterviewSessionDto(
  session: InterviewSessionDto,
  endpoint: string,
): InterviewSessionDto {
  const context = { endpoint, payload: session };
  const toRenderedTextSource = (value: unknown): RenderedTextSource => {
    if (typeof value === "string" || value === null || value === undefined) {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (typeof value === "object" && value && "type" in value && "content" in value) {
      const record = value as { type?: unknown; content?: unknown };
      if (
        (record.type === "plain_text" ||
          record.type === "structured" ||
          record.type === "markdown") &&
        typeof record.content === "string"
      ) {
        return {
          type: record.type,
          content: record.content,
        };
      }
    }
    return undefined;
  };
  const sanitizeText = (value: unknown, field: string) =>
    sanitizeRenderedTextValue(toRenderedTextSource(value), { ...context, field });
  const sanitizeList = (value: unknown, field: string) =>
    Array.isArray(value)
      ? sanitizeRenderedTextList(
          value.filter((entry): entry is string => typeof entry === "string"),
          { ...context, field },
        )
      : [];

  return {
    ...session,
    gapList: Array.isArray(session.gapList)
      ? session.gapList.map((gap, index) => ({
          ...gap,
          jdExcerpt: sanitizeText(gap.jdExcerpt, `gapList[${index}].jdExcerpt`),
          baselineExcerpt: gap.baselineExcerpt
            ? sanitizeText(gap.baselineExcerpt, `gapList[${index}].baselineExcerpt`)
            : gap.baselineExcerpt,
        }))
      : session.gapList,
    questions: Array.isArray(session.questions)
      ? session.questions.map((question, index) => ({
          ...question,
          prompt: sanitizeText(question.prompt, `questions[${index}].prompt`),
          jdReference: sanitizeText(question.jdReference, `questions[${index}].jdReference`),
        }))
      : session.questions,
    responses: Array.isArray(session.responses)
      ? sanitizeRenderedTextList(
          session.responses.filter((entry): entry is string => typeof entry === "string"),
          { ...context, field: "responses" },
        )
      : session.responses,
    recommendedAdditions: Array.isArray(session.recommendedAdditions)
      ? session.recommendedAdditions.map((addition, index) => ({
          ...addition,
          text: sanitizeText(addition.text, `recommendedAdditions[${index}].text`),
          sources: Array.isArray(addition.sources)
            ? addition.sources.map((source, sourceIndex) => ({
                ...source,
                questionPrompt: source.questionPrompt
                  ? sanitizeText(
                      source.questionPrompt,
                      `recommendedAdditions[${index}].sources[${sourceIndex}].questionPrompt`,
                    )
                  : source.questionPrompt,
              }))
            : addition.sources,
        }))
      : session.recommendedAdditions,
    expandedFitAssessment: session.expandedFitAssessment
      ? {
          ...session.expandedFitAssessment,
          originalVerdict: session.expandedFitAssessment.originalVerdict
            ? sanitizeText(session.expandedFitAssessment.originalVerdict, "expandedFitAssessment.originalVerdict")
            : session.expandedFitAssessment.originalVerdict,
          expandedVerdict: session.expandedFitAssessment.expandedVerdict
            ? sanitizeText(session.expandedFitAssessment.expandedVerdict, "expandedFitAssessment.expandedVerdict")
            : session.expandedFitAssessment.expandedVerdict,
        }
      : session.expandedFitAssessment,
    validationResults: session.validationResults,
  };
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
  if (!addition) return "Suggested from your interview review";
  const sources = Array.isArray(addition.sources) ? addition.sources : [];
  if (sources.length === 0) return "Suggested from your interview review";
  return "Suggested from your interview review";
}

function resolveExpandedComputeFailure(error: unknown): ExpandedComputeFailure {
  if (error instanceof InterviewApiError) {
    switch (error.code) {
      case "interview_not_found":
        return {
          message: error.message,
          nextActionLabel: "Back to Results",
          nextActionHref: "/results",
          action: "navigate",
        };
      case "baseline_not_found":
      case "baseline_version_mismatch":
        return {
          message: error.message,
          nextActionLabel: "Back to Baseline",
          nextActionHref: "/baseline",
          action: "navigate",
        };
      case "target_context_missing":
        return {
          message: error.message,
          nextActionLabel: "Back to Results",
          nextActionHref: "/results",
          action: "navigate",
        };
      case "incomplete_answers":
      case "insufficient_answers":
        return {
          message: error.message,
          nextActionLabel: "Save responses",
          nextActionHref: null,
          action: "save",
        };
      case "missing_baseline_link":
      case "missing_job_context":
      case "invalid_baseline_linkage":
        return {
          message: error.message,
          nextActionLabel:
            error.code === "missing_baseline_link" || error.code === "invalid_baseline_linkage"
              ? "Back to Baseline"
              : "Back to Results",
          nextActionHref:
            error.code === "missing_baseline_link" || error.code === "invalid_baseline_linkage"
              ? "/baseline"
              : "/results",
          action: "navigate",
        };
      case "computation_timeout":
        return {
          message: error.message,
          nextActionLabel: "Retry compute",
          nextActionHref: null,
          action: "retry",
        };
      case "computation_failed":
      case "expanded_fit_analysis_failed":
      case "temporarily_unavailable":
      default:
        return {
          message: error.message,
          nextActionLabel: "Retry compute",
          nextActionHref: null,
          action: "retry",
        };
    }
  }

  const message = error instanceof Error ? error.message : "Unable to compute expanded fit.";
  return {
    message,
    nextActionLabel: "Retry compute",
    nextActionHref: null,
    action: "retry",
  };
}

const COMPLETION_STATUS_VALUES = ["complete", "completed", "done", "closed", "finished"];

type ComputeStatus = "idle" | "loading" | "success" | "error";

type InterviewWorkflowState =
  | "drafting_answers"
  | "answers_saved"
  | "validating_additions"
  | "ready_to_compute"
  | "computing"
  | "expanded_fit_ready"
  | "needs_more_input"
  | "blocked"
  | "failed";

type ExpandedComputeFailure = {
  message: string;
  nextActionLabel: string;
  nextActionHref: string | null;
  action: "save" | "retry" | "navigate";
};

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
  const [expandedComputeFailure, setExpandedComputeFailure] = useState<ExpandedComputeFailure | null>(null);
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
  const currentAcceptedAdditionIdsRef = useRef<string[]>([]);
  const currentSessionScopeRef = useRef<WorkflowRequestScope>({
    baselineId: null,
    jobId: null,
    baselineVersionId: null,
    analysisId: null,
    sessionId: null,
  });
  const currentSessionIdRef = useRef<string | null>(sessionId ?? null);
  const saveRequestRef = useRef<{ requestId: string; sessionId: string } | null>(null);
  const decisionRequestRef = useRef<Record<string, { requestId: string; sessionId: string }>>({});
  const acceptedSaveRequestRef = useRef<{ requestId: string; sessionId: string } | null>(null);
  const computeRequestRef = useRef<{ requestId: string; sessionId: string } | null>(null);
  const promotionRequestRef = useRef<{ requestId: string; sessionId: string } | null>(null);
  const interviewDraftStorageKey = useMemo(
    () => (sessionId ? `ttr.interview-draft:${sessionId}` : null),
    [sessionId],
  );

  const createRequestId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const applySessionUpdate = useCallback(
    (data: InterviewSessionDto, options?: { preserveAnswers?: boolean }) => {
      const sanitizedData = sanitizeInterviewSessionDto(data, "/api/interviews/:id");
      setSession(sanitizedData);

      if (options?.preserveAnswers) {
        return;
      }

      const questionCount = sanitizedData?.questions?.length ?? 0;
      const existingResponses =
        Array.isArray(sanitizedData?.responses) && sanitizedData.responses.length
          ? sanitizedData.responses.map((entry) => entry?.toString() ?? "")
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

  useEffect(() => {
    const expandedAssessmentId =
      typeof session?.expandedFitAssessment?.assessmentId === "string"
        ? session.expandedFitAssessment.assessmentId
        : null;
    currentSessionIdRef.current = sessionId ?? null;
    currentSessionScopeRef.current = {
      baselineId: session?.baselineId ?? null,
      jobId: session?.jobId ?? null,
      baselineVersionId: session?.baselineVersionId ?? null,
      analysisId: expandedAssessmentId,
      sessionId: sessionId ?? null,
    };
  }, [session?.baselineId, session?.baselineVersionId, session?.expandedFitAssessment?.assessmentId, session?.jobId, sessionId]);

  useEffect(() => {
    currentAcceptedAdditionIdsRef.current = acceptedAdditionIds;
  }, [acceptedAdditionIds]);

  // Moved up: this must be declared before any callbacks that reference it.
  const saveAcceptedAdditions = useCallback(
    async (nextAcceptedIds: string[]) => {
      if (!sessionId) return;
      if (acceptedSaveRequestRef.current?.sessionId === sessionId && acceptedSaving) return;

      const requestId = createRequestId();
      acceptedSaveRequestRef.current = { requestId, sessionId };
      setAcceptedSaving(true);
      setAcceptedError(null);
      setReviewMessage(null);

      try {
        const updatedSession = await updateInterviewAcceptedAdditions(sessionId, nextAcceptedIds);
        if (
          acceptedSaveRequestRef.current?.requestId !== requestId ||
          currentSessionIdRef.current !== sessionId
        ) {
          logWorkflowRequestEvent("stale_response_dropped", {
            action: "save_accepted_additions",
            expected: {
              baselineId: session?.baselineId ?? null,
              jobId: session?.jobId ?? null,
              baselineVersionId: session?.baselineVersionId ?? null,
              sessionId,
            },
            current: currentSessionScopeRef.current,
            requestId,
            source: "interview",
          });
          return;
        }
        applySessionUpdate(updatedSession, { preserveAnswers: true });
        setReviewMessage("Accepted additions updated.");
      } catch (saveError) {
        if (
          acceptedSaveRequestRef.current?.requestId !== requestId ||
          currentSessionIdRef.current !== sessionId
        ) {
          return;
        }
        setAcceptedError(
          saveError instanceof Error ? saveError.message : "Unable to save accepted additions.",
        );
      } finally {
        if (acceptedSaveRequestRef.current?.requestId === requestId) {
          setAcceptedSaving(false);
          acceptedSaveRequestRef.current = null;
          if (
            currentAcceptedAdditionIdsRef.current.join("|") !== nextAcceptedIds.join("|")
          ) {
            void saveAcceptedAdditions(currentAcceptedAdditionIdsRef.current);
          }
        }
      }
    },
    [acceptedSaving, applySessionUpdate, session?.baselineId, session?.baselineVersionId, session?.jobId, sessionId],
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
            console.error("[interviews] load_failed", {
              area: "interviews",
              operation: "load_session",
              status: "error",
              code: "load_failed",
              sessionId,
              responseStatus: response.status,
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
          console.error("[interviews] load_failed", {
            area: "interviews",
            operation: "load_session",
            status: "error",
            code: "load_failed",
            sessionId,
            message,
            error: loadError instanceof Error ? loadError.message : String(loadError),
          });
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
    if (!sessionId || loadStatus !== "success" || !interviewDraftStorageKey || typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(interviewDraftStorageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { answers?: unknown };
      if (!Array.isArray(parsed.answers)) return;

      const questionCount = session?.questions?.length ?? 0;
      const nextAnswers = parsed.answers
        .map((value) => (typeof value === "string" ? value : ""))
        .slice(0, questionCount);

      if (nextAnswers.some((entry) => entry.trim().length > 0)) {
        setAnswers((current) => {
          if (current.some((entry) => entry.trim().length > 0)) {
            return current;
          }
          return Array.from({ length: questionCount }, (_, index) => nextAnswers[index] ?? "");
        });
      }
    } catch {
      // Draft restore is best effort.
    }
  }, [interviewDraftStorageKey, loadStatus, session?.questions?.length, sessionId]);

  useEffect(() => {
    if (!interviewDraftStorageKey || loadStatus !== "success" || typeof window === "undefined") {
      return;
    }

    try {
      const trimmedAnswers = answers.map((answer) => (answer ?? "").trim());
      window.localStorage.setItem(
        interviewDraftStorageKey,
        JSON.stringify({
          answers: trimmedAnswers,
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Draft persistence is best effort.
    }
  }, [answers, interviewDraftStorageKey, loadStatus]);

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
    if (saving) return;

    if (answeredCount === 0) {
      setError("Add at least one response before saving.");
      return;
    }

    const requestId = createRequestId();
    saveRequestRef.current = { requestId, sessionId };
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updatedSession = await saveInterviewResponses(sessionId, trimmedResponses);
      if (saveRequestRef.current?.requestId !== requestId || currentSessionIdRef.current !== sessionId) {
        logWorkflowRequestEvent("stale_response_dropped", {
          action: "save_responses",
          expected: {
            baselineId: session?.baselineId ?? null,
            jobId: session?.jobId ?? null,
            baselineVersionId: session?.baselineVersionId ?? null,
            sessionId,
          },
          current: currentSessionScopeRef.current,
          requestId,
          source: "interview",
        });
        return;
      }
      applySessionUpdate(updatedSession, { preserveAnswers: true });
      setMessage("Responses saved. You can revisit this page anytime.");
    } catch (saveError) {
      if (saveRequestRef.current?.requestId !== requestId || currentSessionIdRef.current !== sessionId) {
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "Unable to save responses.");
    } finally {
      if (saveRequestRef.current?.requestId === requestId) {
        setSaving(false);
        saveRequestRef.current = null;
      }
    }
  };

  const handleDecision = async (
    addition: RecommendedAddition,
    decision: RecommendedAdditionDecision,
  ) => {
    if (!sessionId || !addition?.id) return;
    if (decisionSavingId === addition.id) return;

    const requestId = createRequestId();
    decisionRequestRef.current[addition.id] = { requestId, sessionId };
    setDecisionSavingId(addition.id);
    setError(null);
    setMessage(null);

    try {
      const updatedSession = await submitInterviewAdditionDecisions(sessionId, [
        { additionId: addition.id, decision },
      ]);
      if (
        decisionRequestRef.current[addition.id]?.requestId !== requestId ||
        currentSessionIdRef.current !== sessionId
      ) {
        logWorkflowRequestEvent("stale_response_dropped", {
          action: "save_decision",
          expected: {
            baselineId: session?.baselineId ?? null,
            jobId: session?.jobId ?? null,
            baselineVersionId: session?.baselineVersionId ?? null,
            sessionId,
          },
          current: currentSessionScopeRef.current,
          requestId,
          source: "interview",
        });
        return;
      }
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
      if (
        decisionRequestRef.current[addition.id]?.requestId !== requestId ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }
      setError(decisionError instanceof Error ? decisionError.message : "Unable to save decision.");
    } finally {
      if (decisionRequestRef.current[addition.id]?.requestId === requestId) {
        setDecisionSavingId(null);
        delete decisionRequestRef.current[addition.id];
      }
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
    if (expandedComputing) return;

    const requestId = createRequestId();
    computeRequestRef.current = { requestId, sessionId };
    setExpandedComputing(true);
    setExpandedComputeError(null);
    setExpandedComputeFailure(null);
    setReviewMessage(null);
    setLastComputeStatus("loading");

    try {
      const updatedSession = await computeInterviewExpandedFit(sessionId);
      if (
        computeRequestRef.current?.requestId !== requestId ||
        currentSessionIdRef.current !== sessionId
      ) {
        logWorkflowRequestEvent("stale_response_dropped", {
          action: "compute_expanded_fit",
          expected: {
            baselineId: session?.baselineId ?? null,
            jobId: session?.jobId ?? null,
            baselineVersionId: session?.baselineVersionId ?? null,
            sessionId,
          },
          current: currentSessionScopeRef.current,
          requestId,
          source: "interview",
        });
        return;
      }
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
      if (
        computeRequestRef.current?.requestId !== requestId ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }
      const failure = resolveExpandedComputeFailure(computeError);
      setExpandedComputeError(failure.message);
      setExpandedComputeFailure(failure);
      setLastComputeStatus("error");
      setLastComputeAt(new Date().toISOString());
    } finally {
      if (computeRequestRef.current?.requestId === requestId) {
        setExpandedComputing(false);
        computeRequestRef.current = null;
      }
    }
  };

  const handlePromoteAcceptedAdditions = async () => {
    if (!sessionId) return;
    if (promotionSaving) return;

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

    const requestId = createRequestId();
    promotionRequestRef.current = { requestId, sessionId };
    setPromotionSaving(true);
    setPromotionError(null);
    setReviewMessage(null);

    try {
      const promotion = await promoteInterviewAcceptedAdditions(sessionId);
      if (
        promotionRequestRef.current?.requestId !== requestId ||
        currentSessionIdRef.current !== sessionId
      ) {
        logWorkflowRequestEvent("stale_response_dropped", {
          action: "promote_baseline",
          expected: {
            baselineId: session?.baselineId ?? null,
            jobId: session?.jobId ?? null,
            baselineVersionId: session?.baselineVersionId ?? null,
            sessionId,
          },
          current: currentSessionScopeRef.current,
          requestId,
          source: "interview",
        });
        return;
      }
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
      publishBaselineUpdated({ baselineId: session?.baselineId ?? null, source: "interview" });
    } catch (promoteError) {
      if (
        promotionRequestRef.current?.requestId !== requestId ||
        currentSessionIdRef.current !== sessionId
      ) {
        return;
      }
      setPromotionError(
        promoteError instanceof Error ? promoteError.message : "Unable to promote additions.",
      );
    } finally {
      if (promotionRequestRef.current?.requestId === requestId) {
        setPromotionSaving(false);
        promotionRequestRef.current = null;
      }
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
  const studioUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (session?.jobId) {
      params.set("jobId", session.jobId);
    }
    if (analyzeBaselineVersionId) {
      params.set("baselineVersionId", analyzeBaselineVersionId);
    }
    const query = params.toString();
    return query ? `/studio?${query}` : "/studio";
  }, [analyzeBaselineVersionId, session?.jobId]);
  const persistedResponseCount = useMemo(
    () =>
      Array.isArray(session?.responses)
        ? session.responses.filter((entry) => Boolean(entry?.trim?.())).length
        : 0,
    [session?.responses],
  );
  const persistedAcceptedAdditionCount = persistedAcceptedAdditions.length;
  const completionReason = backendIndicatesCompletion
    ? "Backend marked this interview as complete."
    : persistedResponseCount > 0
      ? "Responses are saved. Validate additions or compute expanded fit when the flow is ready."
      : "Use the actions below to move forward.";
  const loopSteps = [
    {
      key: "responses",
      label: "1. Save responses",
      complete: persistedResponseCount > 0,
    },
    {
      key: "decisions",
      label: "2. Validate additions",
      complete: persistedAcceptedAdditionCount > 0,
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

  const hasUnsavedResponseDraft = useMemo(
    () =>
      trimmedResponses.some(
        (response, index) =>
          response !== (session?.responses?.[index]?.trim?.() ?? ""),
      ),
    [session?.responses, trimmedResponses],
  );
  const canComputeExpandedFit =
    baselineAvailable &&
    Boolean(session?.jobId) &&
    persistedResponseCount > 0 &&
    persistedAcceptedAdditionCount > 0 &&
    !saving &&
    !acceptedSaving &&
    !decisionSavingId &&
    !expandedComputing;
  const canPromoteExpandedFit =
    baselineAvailable &&
    expandedFitComputed &&
    persistedAcceptedAdditionCount > 0 &&
    !saving &&
    !acceptedSaving &&
    !decisionSavingId &&
    !expandedComputing;
  const workflowState: InterviewWorkflowState = useMemo(() => {
    if (expandedComputing) return "computing";
    if (expandedFitDetails) return "expanded_fit_ready";
    if (expandedComputeFailure) {
      return expandedComputeFailure.action === "save" ? "needs_more_input" : "failed";
    }
    if (promotionError || acceptedError || error) return "failed";
    if (baselineMissingForSession || tierGateError || loadComplianceError) return "blocked";
    if (!session?.jobId) return "blocked";
    if (acceptedSaving || Boolean(decisionSavingId)) return "validating_additions";
    if (saving) return "drafting_answers";
    if (hasUnsavedResponseDraft) return "drafting_answers";
    if (persistedAcceptedAdditionCount > 0 && persistedResponseCount > 0) return "ready_to_compute";
    if (persistedResponseCount > 0) return "answers_saved";
    return "needs_more_input";
  }, [
    acceptedError,
    acceptedSaving,
    baselineMissingForSession,
    decisionSavingId,
    error,
    expandedComputing,
    expandedComputeFailure,
    expandedFitDetails,
    hasUnsavedResponseDraft,
    loadComplianceError,
    persistedAcceptedAdditionCount,
    persistedResponseCount,
    promotionError,
    saving,
    session?.jobId,
    tierGateError,
  ]);

  const workflowSummary = useMemo(() => {
    switch (workflowState) {
      case "computing":
        return {
          title: "Computing expanded fit",
          body:
            "We are scoring the saved interview against the linked baseline. Your responses stay preserved while this runs.",
        };
      case "expanded_fit_ready":
        return {
          title: "Expanded fit is ready",
          body:
            "Review the result below, then promote accepted additions or return to Results when you are ready.",
        };
      case "blocked":
        return {
          title: "Workflow blocked",
          body:
            "This interview is missing required context. Use the exit links below to reconnect the baseline or role before computing.",
        };
      case "failed":
        return {
          title: "Last step failed",
          body:
            "Your work is still on the page. Use the recovery action below or return to Baseline/Results and try again.",
        };
      case "validating_additions":
        return {
          title: "Validating additions",
          body:
            "Your decisions are syncing to the interview record. Keep going once the save finishes.",
        };
      case "ready_to_compute":
        return {
          title: "Ready to compute",
          body:
            "Saved responses and accepted additions are in place. Compute expanded fit when you are ready.",
        };
      case "answers_saved":
        return {
          title: "Answers saved",
          body:
            "Responses are saved. Validate the additions that matter, then compute expanded fit.",
        };
      case "drafting_answers":
        return {
          title: "Drafting answers",
          body:
            "You have unsaved changes. Save the answers you want to keep before validating additions.",
        };
      case "needs_more_input":
      default:
        return {
          title: "More input needed",
          body:
            "Add at least one useful response, save it, then validate additions so expanded fit can run.",
        };
    }
  }, [workflowState]);

  return (
    <PageShell>
      <div className="space-y-6 pb-10">
        <PageHeader
          kicker="Interview session"
          title="Baseline Expansion Interview"
          description="Short guided review to sharpen evidence, save progress, and compute expanded fit without trapping you in an endless questionnaire."
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
                  Back to Opportunities
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
                <p className="mt-1 text-sm text-slate-300">
                  Focus on the highest-signal details: scope, impact, and the facts that strengthen expanded fit.
                </p>
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
                        const guidance = mapGapToUserGuidance({
                          requirement: gap?.jdExcerpt ?? gap?.baselineExcerpt ?? gapId,
                          baselineEvidence: gap?.baselineExcerpt ?? null,
                          summary: gap?.jdExcerpt ?? null,
                          fallbackTitle: "Strengthen this example",
                        });
                        return (
                          <div
                            key={gapId}
                            className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-slate-100">{guidance.title}</p>
                                <p className="text-sm text-slate-300">{guidance.description}</p>
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
                    const guidance = mapGapToUserGuidance({
                      requirement: question.prompt ?? gap?.jdExcerpt ?? question.gapId,
                      baselineEvidence: gap?.baselineExcerpt ?? null,
                      summary: gap?.jdExcerpt ?? null,
                      fallbackTitle: "Add context to this example",
                    });
                    return (
                      <div key={(question.prompt ?? index) + "-" + index} className="space-y-4">
                        <div className="space-y-3">
                          <label className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                            {guidance.title}
                          </label>
                          <p className="text-sm text-slate-300">{guidance.description}</p>
                          {guidance.whyItMatters ? (
                            <p className="text-xs text-slate-400">{guidance.whyItMatters}</p>
                          ) : null}
                          <p className="text-[11px] text-slate-400">
                            Add one concrete example from your experience and keep it factual.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-white/15 bg-slate-900/70 p-3">
                          <textarea
                            value={answers[index] ?? ""}
                            onChange={(event) => handleChange(index, event.target.value)}
                            className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-3 py-3 text-sm text-slate-100 outline-none focus:border-amber-400 focus:bg-white/10"
                            rows={6}
                            placeholder={guidance.examplePrompt}
                          />
                        </div>
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
              </div>
              {message ? <Alert intent="success">{message}</Alert> : null}
              {error ? <Alert intent="error">{error}</Alert> : null}
            </section>

            <section className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
              <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Workflow state
                </p>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-slate-100">{workflowSummary.title}</h3>
                  <p className="text-sm text-slate-300">{workflowSummary.body}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/results"
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                  >
                    Back to Results
                  </Link>
                  <Link
                    href="/baseline"
                    className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                  >
                    Back to Baseline
                  </Link>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Progress</p>
                <h3 className="text-lg font-semibold text-slate-100">Where you are</h3>
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
              {expandedComputeError ? (
                <div className="space-y-2">
                  <Alert intent="error">{expandedComputeError}</Alert>
                  {expandedComputeFailure ? (
                    <div className="flex flex-wrap gap-2">
                      {expandedComputeFailure.nextActionHref ? (
                        <Link
                          href={expandedComputeFailure.nextActionHref}
                          className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                        >
                          {expandedComputeFailure.nextActionLabel}
                        </Link>
                      ) : expandedComputeFailure.action === "save" ? (
                        <FormButton onClick={handleSave}>{expandedComputeFailure.nextActionLabel}</FormButton>
                      ) : (
                        <FormButton onClick={handleRecomputeExpandedFit}>
                          {expandedComputing ? "Computing..." : expandedComputeFailure.nextActionLabel}
                        </FormButton>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                  disabled={expandedComputing || !canComputeExpandedFit}
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
                  disabled={promotionSaving || !canPromoteExpandedFit}
                >
                  {promotionSaving ? "Promoting..." : "Promote accepted additions to baseline"}
                </FormButton>
                {promotedBaselineReference ? (
                  <Alert intent="success" title="Promotion complete">
                    New baseline version is ready: {promotedBaselineReference}
                  </Alert>
                ) : null}
                {!promotedBaselineReference ? (
                  <Alert intent="warning" title="Artifact readiness">
                    Artifacts are not ready yet. Promote a baseline version, then generate documents in Studio.
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
                  <Link href={studioUrl} className="text-xs text-sky-300 underline">
                    Open Resume Studio
                  </Link>
                  <Link href="/job-tracker" className="text-xs text-sky-300 underline">
                    Open Opportunities
                  </Link>
                </div>
                {interviewComplete ? (
                  <p className="text-xs text-emerald-300">
                    Interview complete. You can now refresh Fit Review and continue to document generation.
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


