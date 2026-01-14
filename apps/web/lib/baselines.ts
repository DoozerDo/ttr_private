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

export interface BaselineDto {
  id: string;
  userId: string;
  version: number;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  hash: string | null;
  status: BaselineStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sections?: BaselineSectionDto[];
  versions?: BaselineVersionDto[];
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

export interface BaselineUploadStatus {
  isDuplicate: boolean;
  versionNumber: number;
  message: string;
}

export interface BaselineUploadResponse {
  baseline: BaselineDto;
  uploadStatus: BaselineUploadStatus;
}

const BASELINE_API_PATH = "/api/baselines";

async function ensureJsonResponse(response: Response, action: string) {
  if (!response.ok) {
    const statusText = response.statusText?.trim();
    const statusLabel = statusText
      ? `${response.status} ${statusText}`
      : `${response.status}`;
    const text = await response.text().catch(() => "");
    let message = `${action} failed (${statusLabel})`;

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
        // Ignore non-JSON responses to avoid showing HTML in the UI.
      }
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Invalid response from ${action}`);
  }

  return response.json() as Promise<BaselineDto>;
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
