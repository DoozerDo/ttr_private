export type AnalysisResult = Record<string, unknown>;

export type StoredPayload = {
  createdAt: string;
  payload: unknown;
};

export function normalizeAnalysisResult(input: unknown): AnalysisResult {
  if (input && typeof input === "object") return input as AnalysisResult;
  return { value: input };
}

export async function saveLastAnalysis(payload: StoredPayload) {
  const res = await fetch("/api/session/last-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error("Unable to save analysis");

  return res.json().catch(() => ({ ok: true }));
}
