import { FALLBACK_RENDERED_TEXT, sanitizeRenderedTextList, sanitizeRenderedTextValue } from "@/lib/renderedText";

export type StudioUnlockContext = {
  isUnlockFlow: boolean;
  dimension: string | null;
  missingEvidence: string[];
};

function cleanValue(value: unknown, field: string): string {
  if (typeof value !== "string") return "";
  const cleaned = sanitizeRenderedTextValue(value, {
    endpoint: "studioUnlockResolver",
    field,
  });
  return cleaned === FALLBACK_RENDERED_TEXT ? "" : cleaned;
}

export function resolveStudioUnlockContext(searchParams: { toString: () => string }): StudioUnlockContext {
  const params = new URLSearchParams(searchParams?.toString?.() ?? "");
  const fromUnlock = (params.get("fromUnlock") ?? "").trim().toLowerCase() === "true";
  const dimension = cleanValue(params.get("unlockDimension"), "unlockDimension").trim();
  const rawEvidence = params.getAll("missingEvidence");
  const missingEvidence = sanitizeRenderedTextList(rawEvidence, {
    endpoint: "studioUnlockResolver",
    field: "missingEvidence",
  })
    .map((item) => cleanValue(item, "missingEvidence.item").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const normalizedEvidence = Array.from(new Set(missingEvidence)).slice(0, 10);

  return {
    isUnlockFlow: Boolean(fromUnlock && dimension),
    dimension: dimension || null,
    missingEvidence: normalizedEvidence,
  };
}

