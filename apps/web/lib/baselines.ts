export type BaselineSectionType =
  | "RAW"
  | "SUMMARY"
  | "EXPERIENCE"
  | "PROJECT"
  | "SKILLS"
  | "EDUCATION"
  | "OTHER";

export type BaselineIncludePolicy = "always" | "optional" | "never";

export interface BaselineSectionDto {
  id: string;
  baselineId: string;
  sectionType: BaselineSectionType;
  title: string | null;
  content: string;
  includePolicy: BaselineIncludePolicy;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface BaselineVersionDto {
  id: string;
  baselineId: string;
  versionNumber: number;
  fileHash: string | null;
  storagePath: string;
  createdAt: string;
}

export type BaselineStatus = "ACTIVE" | "ARCHIVED";
export const BASELINE_LIBRARY_CAP = 3;

export interface BaselineAssessmentSummaryDto {
  latestAssessmentId: string | null;
  latestAssessmentCreatedAt: string | null;
  // Role-analysis metadata only. Never use this field to derive baseline readiness.
  latestFitScore: number | null;
  // Baseline-readiness metadata only.
  hasCompletedAssessment: boolean;
}

export function isBaselineAnalyzedFromSummary(
  summary?: BaselineAssessmentSummaryDto | null,
): boolean {
  if (!summary) return false;
  return summary.hasCompletedAssessment === true || Boolean(summary.latestAssessmentId);
}

export function getLatestRoleAnalysisFitScore(
  summary?: BaselineAssessmentSummaryDto | null,
): number | null {
  if (!summary || typeof summary.latestFitScore !== "number") return null;
  return summary.latestFitScore;
}

export interface BaselineDto {
  id: string;
  userId: string;
  version: number;
  versionNumber?: number;
  isActive?: boolean;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  hash: string | null;
  status: BaselineStatus;
  archivedAt: string | null;
  originalBaselineScore?: number | null;
  latestBaselineScore?: number | null;
  firstAnalyzedAt?: string | null;
  lastAnalyzedAt?: string | null;
  latestAssessmentSummary?: BaselineAssessmentSummaryDto;
  createdAt: string;
  updatedAt: string;
  sections?: BaselineSectionDto[];
  versions?: BaselineVersionDto[];
}

export function getActiveBaselines(baselines: BaselineDto[]): BaselineDto[] {
  return baselines.filter((baseline) => baseline.status !== "ARCHIVED");
}

export function hasActiveBaselines(baselines: BaselineDto[]): boolean {
  return getActiveBaselines(baselines).length > 0;
}

export interface BaselineBlockDto {
  id: string;
  section_type: BaselineSectionType;
  title: string | null;
  content: string;
  include_tag: BaselineIncludePolicy;
  order_index: number;
}

export interface BaselineBlockPolicyResponse {
  baseline_version_id: string;
  baseline_version_hash: string | null;
  blocks: BaselineBlockDto[];
}

export interface BaselineBlockUpdateDto {
  id: string;
  include_tag: BaselineIncludePolicy;
  order_index?: number | null;
}

export interface UpdateBaselineBlocksRequest {
  baseline_version_id: string;
  baseline_version_hash: string | null;
  blocks: BaselineBlockUpdateDto[];
}

export interface UpdateBaselineBlocksResponse {
  baseline_version_id: string;
  updated_blocks: BaselineBlockDto[];
  new_version_id: string;
  hash: string;
}

const BASELINE_API_PATH = "/api/baselines";

export class BaselineMutationError extends Error {
  status: number;
  payload: unknown;
  action: string;

  constructor(action: string, status: number, message: string, payload: unknown) {
    super(message);
    this.name = "BaselineMutationError";
    this.action = action;
    this.status = status;
    this.payload = payload;
  }
}

export function describeBaselineMutationError(
  error: unknown,
  actionLabel: string,
) {
  if (error instanceof BaselineMutationError) {
    if (error.status === 401 || error.status === 403) {
      return "Your session expired. Refresh and try again.";
    }

    if (error.status === 404) {
      return "We couldn't find that baseline.";
    }

    if (error.status === 409 || error.status === 422) {
      return error.message;
    }

    if (error.status >= 500) {
      return `We couldn't ${actionLabel} this baseline. Try again.`;
    }

    return error.message;
  }

  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("fetch failed")) {
    return "We couldn't reach the baseline service. Check your connection and try again.";
  }

  if (message.trim()) {
    return message;
  }

  return `We couldn't ${actionLabel} this baseline. Try again.`;
}

function parseMutationErrorMessage(response: Response, action: string) {
  const statusText = response.statusText?.trim();
  const statusLabel = statusText
    ? `${response.status} ${statusText}`
    : `${response.status}`;
  const fallback = `${action} failed (${statusLabel})`;
  return response.text().then((text) => {
    if (!text) {
      return { message: fallback, payload: null as unknown };
    }

    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const parsedMessage =
        (parsed?.message as string | undefined)?.trim() ||
        (parsed?.error as string | undefined)?.trim() ||
        null;

      return {
        message: parsedMessage || fallback,
        payload: parsed,
      };
    } catch {
      return { message: fallback, payload: text };
    }
  });
}

async function ensureJsonPayload<T>(response: Response, action: string) {
  if (!response.ok) {
    const { message, payload } = await parseMutationErrorMessage(response, action);
    throw new BaselineMutationError(action, response.status, message, payload);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Invalid response from ${action}`);
  }

  return response.json() as Promise<T>;
}

async function ensureJsonResponse(response: Response, action: string) {
  return ensureJsonPayload<BaselineDto>(response, action);
}

async function fetchBaselineList(includeArchived = false) {
  const query = includeArchived ? "?includeArchived=true" : "";
  const url = `${BASELINE_API_PATH}${query}`;
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    const statusText = response.statusText?.trim();
    const statusLabel = statusText
      ? `${response.status} ${statusText}`
      : `${response.status}`;
    const text = await response.text().catch(() => "");
    let message = `Failed to load baselines (${statusLabel})`;

    if (text) {
      try {
        const parsed = JSON.parse(text);
        const parsedMessage =
          (parsed?.message as string | undefined) ??
          (parsed?.error as string | undefined);

        if (parsedMessage?.trim()) {
          message = parsedMessage.trim();
        }
      } catch {
        // Ignore non-JSON responses that may include HTML.
      }
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Invalid baseline list response");
  }

  const data = (await response.json()) as unknown;
  return data as BaselineDto[];
}

export async function listBaselines(includeArchived = false) {
  return fetchBaselineList(includeArchived);
}

export async function archiveBaseline(id: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log("[UI][ARCHIVE_CLICK]", id);
  }
  const response = await fetch(`${BASELINE_API_PATH}/${encodeURIComponent(id)}/archive`, {
    method: "PATCH",
    credentials: "include",
  });
  return ensureJsonResponse(response, "Archive");
}

export async function restoreBaseline(id: string) {
  const response = await fetch(`${BASELINE_API_PATH}/${encodeURIComponent(id)}/restore`, {
    method: "PATCH",
    credentials: "include",
  });
  return ensureJsonResponse(response, "Restore");
}

export async function deleteBaseline(id: string) {
  const response = await fetch(`${BASELINE_API_PATH}/${encodeURIComponent(id)}/delete`, {
    method: "DELETE",
    credentials: "include",
  });
  return ensureJsonPayload<{ success?: boolean; message?: string }>(response, "Delete baseline");
}

export async function getBaselineBlocks(
  baselineId: string,
  baselineVersionId: string,
): Promise<BaselineBlockPolicyResponse> {
  const response = await fetch(
    `${BASELINE_API_PATH}/${encodeURIComponent(baselineId)}/blocks?baseline_version_id=${encodeURIComponent(
      baselineVersionId,
    )}`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  return ensureJsonPayload<BaselineBlockPolicyResponse>(
    response,
    "Fetch baseline blocks",
  );
}

export async function updateBaselineBlockPolicies(
  baselineId: string,
  payload: UpdateBaselineBlocksRequest,
): Promise<UpdateBaselineBlocksResponse> {
  const response = await fetch(`${BASELINE_API_PATH}/${encodeURIComponent(baselineId)}/blocks`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return ensureJsonPayload<UpdateBaselineBlocksResponse>(
    response,
    "Update baseline blocks",
  );
}

export async function appendStrengtheningAddition(
  baselineId: string,
  payload: {
    rawText: string;
    signalType?: string | null;
  },
): Promise<BaselineDto> {
  const response = await fetch(
    `${BASELINE_API_PATH}/${encodeURIComponent(baselineId)}/strengthening-additions`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return ensureJsonPayload<BaselineDto>(response, "Append strengthening addition");
}
