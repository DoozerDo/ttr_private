import type {
  AdditionDecisionPayload,
  ExpandedFitAssessment,
  InterviewAcceptedAddition,
  InterviewAcceptedAdditionStatus,
  InterviewSessionDto,
  RecommendedAddition,
  RecommendedAdditionDecision,
  RecommendedAdditionSource,
  RecommendedAdditionStatus,
} from "./interviews";
import apiRoutes from "./apiRoutes.json";

export interface InterviewExpandedFitResponse extends InterviewSessionDto {
  expandedFitAssessment: ExpandedFitAssessment | null;
  expandedFitScore?: number | null;
}

type ApiRouteMap = {
  expandedFitCompute: string;
};

const API_ROUTES: ApiRouteMap = apiRoutes;

type RawInterviewPromotionResponse = {
  baselineVersionId?: string;
  baselineVersionHash?: string | null;
  versionNumber?: number | null;
  baseline_version_id?: string;
  hash?: string | null;
  version_number?: number | null;
};

export type InterviewPromotionResponse = {
  baselineVersionId?: string;
  baselineVersionHash?: string | null;
  versionNumber?: number | null;
};

export type InterviewComputeErrorCode =
  | "interview_not_found"
  | "baseline_not_found"
  | "target_context_missing"
  | "missing_baseline_link"
  | "missing_job_context"
  | "incomplete_answers"
  | "invalid_baseline_linkage"
  | "baseline_version_mismatch"
  | "computation_timeout"
  | "computation_failed"
  | "validation_failed"
  | "compliance_blocked"
  | "temporarily_unavailable"
  | "invalid_promotion_state"
  | "expanded_fit_analysis_failed";

export type InterviewApiErrorPayload = {
  code?: string;
  message?: string;
  detail?: string;
  error?: {
    code?: string;
    message?: string;
    detail?: string;
  };
};

export class InterviewApiError extends Error {
  code: InterviewComputeErrorCode | string | null;
  status: number;

  constructor(message: string, options: { code?: string | null; status: number }) {
    super(message);
    this.name = "InterviewApiError";
    this.code = options.code ?? null;
    this.status = options.status;
  }
}

const debugUiEnabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function hasNumericScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasOwnPropertyValue(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasExpandedAssessmentScore(record: Record<string, unknown>): boolean {
  const assessment = record.expandedFitAssessment;
  if (assessment && isRecord(assessment)) {
    const candidate =
      (assessment as Record<string, unknown>).expandedScore ??
      (assessment as Record<string, unknown>).expanded_score;

    if (hasNumericScore(candidate)) {
      return true;
    }
  }

  const alt = record.expandedFitScore;
  return hasNumericScore(alt);
}

function isInterviewExpandedFitResponse(value: unknown): value is InterviewExpandedFitResponse {
  if (!isRecord(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (!hasOwnPropertyValue(record, "id") || !isString(record.id)) {
    return false;
  }

  if (!hasOwnPropertyValue(record, "status") || !isString(record.status)) {
    return false;
  }

  if (!hasOwnPropertyValue(record, "createdAt") || !isString(record.createdAt)) {
    return false;
  }

  if (!hasOwnPropertyValue(record, "updatedAt") || !isString(record.updatedAt)) {
    return false;
  }

  if (!hasOwnPropertyValue(record, "baselineId") || !isStringOrNull(record.baselineId)) {
    return false;
  }

  if (!hasOwnPropertyValue(record, "baselineVersionId") || !isStringOrNull(record.baselineVersionId)) {
    return false;
  }

  if (!hasOwnPropertyValue(record, "jobId") || !isStringOrNull(record.jobId)) {
    return false;
  }

  if (!hasOwnPropertyValue(record, "expandedFitAssessment")) {
    return false;
  }

  const assessment = record.expandedFitAssessment;
  if (assessment !== null && !isRecord(assessment)) {
    return false;
  }

  return hasExpandedAssessmentScore(record);
}

function expandedFitScoreFromResponse(response: InterviewExpandedFitResponse): number | null {
  const assessment = response.expandedFitAssessment;
  if (assessment && isRecord(assessment)) {
    const maybeScore =
      (assessment as Record<string, unknown>).expandedScore ??
      (assessment as Record<string, unknown>).expanded_score;
    if (hasNumericScore(maybeScore)) {
      return maybeScore;
    }
  }

  if (hasNumericScore(response.expandedFitScore)) {
    return response.expandedFitScore;
  }

  return null;
}

const DECISION_STATUS: Record<RecommendedAdditionDecision, RecommendedAdditionStatus> = {
  accept: "accepted",
  reject: "rejected",
  defer: "deferred",
};

function buildInterviewUrl(id: string, suffix?: string) {
  const encodedId = encodeURIComponent(id);
  if (suffix) {
    return `/api/interviews/${encodedId}${suffix}`;
  }
  return `/api/interviews/${encodedId}`;
}

function expandedFitComputePath(id: string) {
  return API_ROUTES.expandedFitCompute.replace("{id}", encodeURIComponent(id));
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse interview API response body", error);
    return text;
  }
}

function readInterviewErrorPayload(payload: unknown): InterviewApiErrorPayload | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as InterviewApiErrorPayload;
}

function isExpandedFitEnvelope(value: unknown): value is {
  status: "success" | "error";
  code?: string;
  message?: string;
  retryable?: boolean;
  nextAction?: string;
  payload?: InterviewExpandedFitResponse;
  runId?: string;
} {
  if (!isRecord(value)) return false;
  const record = value as Record<string, unknown>;
  return record.status === "success" || record.status === "error";
}

function formatError(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const errorPayload = payload as Record<string, unknown>;
    const candidate =
      (typeof errorPayload.error === "string" && errorPayload.error.trim()
        ? errorPayload.error
        : null) ??
      (typeof errorPayload.message === "string" && errorPayload.message.trim()
        ? errorPayload.message
        : null) ??
      (typeof errorPayload.detail === "string" && errorPayload.detail.trim()
        ? errorPayload.detail
        : null);

    if (candidate) {
      return candidate;
    }
  }

  return fallback;
}

function getInterviewErrorCode(payload: unknown): string | null {
  const errorPayload = readInterviewErrorPayload(payload);
  if (!errorPayload) return null;

  const nestedCode = typeof errorPayload.error?.code === "string" ? errorPayload.error.code.trim() : "";
  if (nestedCode) return nestedCode;

  const topLevelCode = typeof errorPayload.code === "string" ? errorPayload.code.trim() : "";
  return topLevelCode || null;
}

const RECOMMENDED_ADDITION_STATUSES: RecommendedAdditionStatus[] = [
  "proposed",
  "accepted",
  "rejected",
  "deferred",
];

const ACCEPTED_ADDITION_STATUSES: InterviewAcceptedAdditionStatus[] = ["RECOMMENDED", "ACCEPTED"];

function isRecommendedAdditionStatus(value: unknown): value is RecommendedAdditionStatus {
  return typeof value === "string" && RECOMMENDED_ADDITION_STATUSES.includes(value as RecommendedAdditionStatus);
}

function isInterviewAcceptedAdditionStatus(value: unknown): value is InterviewAcceptedAdditionStatus {
  return typeof value === "string" && ACCEPTED_ADDITION_STATUSES.includes(value as InterviewAcceptedAdditionStatus);
}

function parseRecommendedAdditionSource(value: unknown): RecommendedAdditionSource | null {
  if (!isRecord(value)) return null;

  const record = value as Record<string, unknown>;
  const source: RecommendedAdditionSource = {};

  if (isString(record.gapId)) {
    source.gapId = record.gapId;
  }

  if (typeof record.questionIndex === "number") {
    source.questionIndex = record.questionIndex;
  }

  if (isString(record.questionPrompt)) {
    source.questionPrompt = record.questionPrompt;
  }

  if (!source.gapId && source.questionIndex === undefined && !source.questionPrompt) {
    return null;
  }

  return source;
}

function parseRecommendedAddition(value: unknown): RecommendedAddition | null {
  if (!isRecord(value)) return null;

  const record = value as Record<string, unknown>;
  const id = isString(record.id) ? record.id : "";
  const text = isString(record.text) ? record.text.trim() : "";

  if (!id || !text) return null;

  const status = isRecommendedAdditionStatus(record.status) ? record.status : "proposed";
  const sources = Array.isArray(record.sources)
    ? record.sources
        .map(parseRecommendedAdditionSource)
        .filter((entry): entry is RecommendedAdditionSource => Boolean(entry))
    : [];

  return {
    id,
    text,
    status,
    sources,
  };
}

function parseRecommendedAdditionsPayload(value: unknown): RecommendedAddition[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("Unexpected recommended additions response");
  }

  return value
    .map(parseRecommendedAddition)
    .filter((entry): entry is RecommendedAddition => Boolean(entry));
}

function parseInterviewAcceptedAddition(value: unknown): InterviewAcceptedAddition | null {
  if (!isRecord(value)) return null;

  const record = value as Record<string, unknown>;
  if (
    !isString(record.id) ||
    !isString(record.interviewId) ||
    !isString(record.gapId) ||
    !isString(record.suggestion) ||
    !isString(record.createdAt) ||
    !isString(record.updatedAt)
  ) {
    return null;
  }

  if (!isInterviewAcceptedAdditionStatus(record.status)) return null;

  const category = record.category === undefined || record.category === null ? null : record.category;
  if (category !== null && !isString(category)) return null;

  const domain = record.domain === undefined || record.domain === null ? null : record.domain;
  if (domain !== null && !isString(domain)) return null;

  const recommendedAdditionId =
    record.recommendedAdditionId === undefined || record.recommendedAdditionId === null
      ? null
      : record.recommendedAdditionId;

  if (recommendedAdditionId !== null && !isString(recommendedAdditionId)) {
    return null;
  }

  return {
    id: record.id,
    interviewId: record.interviewId,
    gapId: record.gapId,
    category,
    domain,
    suggestion: record.suggestion,
    status: record.status,
    recommendedAdditionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseInterviewAcceptedAdditionsPayload(value: unknown): InterviewAcceptedAddition[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("Unexpected accepted additions response");
  }

  return value
    .map(parseInterviewAcceptedAddition)
    .filter((entry): entry is InterviewAcceptedAddition => Boolean(entry));
}

function ensureInterviewAcceptedAddition(value: unknown): InterviewAcceptedAddition {
  const parsed = parseInterviewAcceptedAddition(value);
  if (!parsed) {
    throw new Error("Unexpected accepted addition payload");
  }
  return parsed;
}

async function fetchInterview<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, init);
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const code = getInterviewErrorCode(payload);
    throw new InterviewApiError(
      formatError(payload, response.statusText || "Interview API error"),
      {
        code,
        status: response.status,
      },
    );
  }

  return payload as T;
}

export async function getInterviewSession(id: string): Promise<InterviewSessionDto> {
  return fetchInterview<InterviewSessionDto>(buildInterviewUrl(id), {
    cache: "no-store",
  });
}

export async function saveInterviewResponses(
  id: string,
  responses: string[],
): Promise<InterviewSessionDto> {
  return fetchInterview<InterviewSessionDto>(buildInterviewUrl(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses }),
  });
}

export async function submitInterviewAdditionDecisions(
  id: string,
  decisions: AdditionDecisionPayload[],
): Promise<InterviewSessionDto> {
  const formatted = decisions
    .map((decision) => {
      const status = DECISION_STATUS[decision.decision];
      if (!decision.additionId || !status) return null;
      return { id: decision.additionId, status };
    })
    .filter(
      (entry): entry is { id: string; status: RecommendedAdditionStatus } => Boolean(entry),
    );

  if (!formatted.length) {
    return getInterviewSession(id);
  }

  return fetchInterview<InterviewSessionDto>(buildInterviewUrl(id, "/decisions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisions: formatted }),
  });
}

export async function updateInterviewAcceptedAdditions(
  id: string,
  acceptedAdditionIds: string[],
): Promise<InterviewSessionDto> {
  return fetchInterview<InterviewSessionDto>(buildInterviewUrl(id, "/accepted-additions"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acceptedAdditionIds }),
  });
}

function recommendedAdditionsPath(id: string): string {
  return buildInterviewUrl(id, "/recommended-additions");
}

function acceptedAdditionsPath(id: string): string {
  return buildInterviewUrl(id, "/accepted-additions");
}

export async function fetchInterviewRecommendedAdditions(
  id: string,
): Promise<RecommendedAddition[]> {
  const payload = await fetchInterview<unknown>(recommendedAdditionsPath(id), {
    cache: "no-store",
  });

  return parseRecommendedAdditionsPayload(payload);
}

export async function fetchInterviewAcceptedAdditions(
  id: string,
): Promise<InterviewAcceptedAddition[]> {
  const payload = await fetchInterview<unknown>(acceptedAdditionsPath(id), {
    cache: "no-store",
  });

  return parseInterviewAcceptedAdditionsPayload(payload);
}

export type AcceptInterviewAdditionPayload = {
  gapId: string;
  suggestion: string;
  category?: string;
  domain?: string;
  recommendedAdditionId?: string;
};

export async function acceptInterviewAddition(
  id: string,
  payload: AcceptInterviewAdditionPayload,
): Promise<InterviewAcceptedAddition> {
  const response = await fetchInterview<unknown>(acceptedAdditionsPath(id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return ensureInterviewAcceptedAddition(response);
}

export async function computeInterviewExpandedFit(
  id: string,
): Promise<InterviewExpandedFitResponse | null> {
  const response = await fetch(expandedFitComputePath(id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({}),
  });
  console.log("SCORING RESPONSE:", response);

  const rawText = await response.text();
  const trimmed = rawText.trim();
  let parsed: unknown = null;

  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch (parseError) {
      throw new Error(
        `Unable to parse expanded fit response: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`,
      );
    }
  }

  if (isExpandedFitEnvelope(parsed)) {
    if (parsed.status === "error") {
      throw new InterviewApiError(
        parsed.message || response.statusText || "Interview API error",
        {
          code: parsed.code ?? getInterviewErrorCode(parsed) ?? null,
          status: response.status,
        },
      );
    }

    if (parsed.payload && isInterviewExpandedFitResponse(parsed.payload)) {
      if (debugUiEnabled) {
        console.debug("computeInterviewExpandedFit response", {
          interviewRecordId: id,
          status: response.status,
          hasExpandedFitScore: expandedFitScoreFromResponse(parsed.payload) !== null,
          runId: parsed.runId ?? null,
        });
      }

      return parsed.payload;
    }

    throw new Error("Expanded fit response payload is incomplete.");
  }

  if (!response.ok) {
    const errorCode = getInterviewErrorCode(parsed ?? rawText);
    throw new InterviewApiError(
      formatError(parsed ?? rawText, response.statusText || "Interview API error"),
      {
        code: errorCode,
        status: response.status,
      },
    );
  }

  if (!trimmed) {
    return null;
  }

  if (!isInterviewExpandedFitResponse(parsed)) {
    throw new Error("Unexpected expanded fit response shape.");
  }

  const expandedScore = expandedFitScoreFromResponse(parsed);
  if (debugUiEnabled) {
    console.debug("computeInterviewExpandedFit response", {
      interviewRecordId: id,
      status: response.status,
      hasExpandedFitScore: expandedScore !== null,
    });
  }

  return parsed;
}

export async function promoteInterviewAcceptedAdditions(
  id: string,
): Promise<InterviewPromotionResponse> {
  const payload = await fetchInterview<RawInterviewPromotionResponse>(
    buildInterviewUrl(id, "/promote-accepted-additions"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  return {
    baselineVersionId: payload.baselineVersionId ?? payload.baseline_version_id,
    baselineVersionHash: payload.baselineVersionHash ?? payload.hash ?? null,
    versionNumber: payload.versionNumber ?? payload.version_number ?? null,
  };
}
