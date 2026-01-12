import type {
  AdditionDecisionPayload,
  ExpandedFitAssessment,
  InterviewSessionDto,
  RecommendedAdditionDecision,
  RecommendedAdditionStatus,
} from "./interviews";

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

export type InterviewExpandedFitResponse = InterviewSessionDto & {
  expandedFitAssessment: ExpandedFitAssessment | null;
};

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

export async function computeInterviewExpandedFit(id: string): Promise<InterviewExpandedFitResponse> {
  const result = await fetchInterview<InterviewExpandedFitResponse>(
    buildInterviewUrl(id, "/compute-expanded-fit"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  if (!result) {
    throw new Error("Empty response from expanded fit computation.");
  }

  return result;
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
