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

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });

  if (res.status === 401) {
    throw new Error("unauthorized");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any));
    const message = data?.message || data?.error || "Request failed";
    throw new Error(message);
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
