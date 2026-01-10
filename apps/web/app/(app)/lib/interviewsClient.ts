export type InterviewPromotionResponse = {
  promoted: boolean;
  message?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const contentType = res.headers.get("content-type") ?? "";

  if (res.status === 401) {
    throw new Error("unauthorized");
  }

  if (!res.ok) {
    const body = contentType.includes("application/json")
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => "");
    const message =
      typeof body === "string"
        ? body
        : body?.message || body?.error || "Request failed";
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export async function getInterviewSession(interviewId: string) {
  return api(`/api/interviews/${interviewId}`, { cache: "no-store" });
}

export async function saveInterviewResponses(interviewId: string, payload: unknown) {
  return api(`/api/interviews/${interviewId}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function submitInterviewAdditionDecisions(interviewId: string, payload: unknown) {
  return api(`/api/interviews/${interviewId}/addition-decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateInterviewAcceptedAdditions(interviewId: string, payload: unknown) {
  return api(`/api/interviews/${interviewId}/accepted-additions`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function promoteInterviewAcceptedAdditions(interviewId: string) {
  return api<InterviewPromotionResponse>(`/api/interviews/${interviewId}/promote`, {
    method: "POST",
  });
}

export function computeInterviewExpandedFit(_: unknown) {
  // If you already have a real implementation elsewhere, wire it later.
  // This exists to unblock build and keeps behavior safe.
  return null;
}
