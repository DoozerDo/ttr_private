export type StarStoryDto = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  competencies?: string[];
  reflections?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type StarStoryFormPayload = {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  competencies?: string[];
  reflections?: string;
};

function resolveResponseMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as { message?: unknown; error?: unknown };
  if (typeof candidate.message === "string" && candidate.message.length) {
    return candidate.message;
  }
  if (typeof candidate.error === "string" && candidate.error.length) {
    return candidate.error;
  }
  return undefined;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });

  if (res.status === 401) {
    throw new Error("unauthorized");
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const errorMessage = resolveResponseMessage(payload) ?? "Request failed";
    throw new Error(errorMessage);
  }

  return (await res.json()) as T;
}

export async function listStarStories(): Promise<StarStoryDto[]> {
  return api<StarStoryDto[]>(`/api/star-stories`, { cache: "no-store" });
}

export async function createStarStory(payload: StarStoryFormPayload): Promise<StarStoryDto> {
  return api<StarStoryDto>(`/api/star-stories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateStarStory(id: string, payload: StarStoryFormPayload): Promise<StarStoryDto> {
  return api<StarStoryDto>(`/api/star-stories/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteStarStory(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/star-stories/${id}`, { method: "DELETE" });
}
