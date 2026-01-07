import { parseTierGateError, type TierGateError } from "@/lib/tiers";

export type StarStoryDto = {
  id: string;
  userId: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflections: string | null;
  competencies: string[];
  createdAt: string;
  updatedAt: string;
};

export type StarStoryFormPayload = Omit<StarStoryDto, "id" | "userId" | "createdAt" | "updatedAt">;

export type StarStoryApiError = Error & {
  validationErrors?: string[];
  tierGate?: TierGateError | null;
  payload?: unknown;
};

const BASE_PATH = "/api/star-stories";

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>;
    return (
      (typeof body.error === "string" ? body.error : null) ??
      (typeof body.message === "string" ? body.message : null) ??
      fallback
    );
  }
  return fallback;
}

function extractValidationErrors(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];

  const body = payload as Record<string, unknown>;
  const candidate =
    Array.isArray(body.validationErrors) && body.validationErrors.length
      ? body.validationErrors
      : Array.isArray(body.errors) && body.errors.length
        ? body.errors
        : typeof body.detail === "string"
          ? [body.detail]
          : [];

  return candidate
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        return (entry as { message?: string }).message ?? "";
      }
      return "";
    })
    .filter((entry): entry is string => Boolean(entry));
}

function createApiError(message: string, payload: unknown, status: number): StarStoryApiError {
  const error = new Error(message) as StarStoryApiError;
  error.payload = payload;
  error.validationErrors = extractValidationErrors(payload);
  error.tierGate = parseTierGateError({ status, payload });
  return error;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const payload = await parseBody(response);
  if (!response.ok) {
    throw createApiError(formatErrorMessage(payload, "Unable to manage STAR stories"), payload, response.status);
  }
  return payload as T;
}

export async function listStarStories(): Promise<StarStoryDto[]> {
  const response = await fetch(BASE_PATH, { cache: "no-store" });
  return handleResponse<StarStoryDto[]>(response);
}

export async function createStarStory(payload: StarStoryFormPayload): Promise<StarStoryDto> {
  const response = await fetch(BASE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<StarStoryDto>(response);
}

export async function updateStarStory(id: string, payload: Partial<StarStoryFormPayload>): Promise<StarStoryDto> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<StarStoryDto>(response);
}

export async function deleteStarStory(id: string): Promise<void> {
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await handleResponse(response);
}
