import type {
  AdditionDecisionPayload,
  ExpandedFitAssessment,
  InterviewSessionDto,
  RecommendedAdditionDecision,
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
  } catch {
    return text;
  }
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

async function fetchInterview<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, init);
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(formatError(payload, response.statusText || "Interview API error"));
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

  if (!response.ok) {
    throw new Error(formatError(parsed ?? rawText, response.statusText || "Interview API error"));
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
