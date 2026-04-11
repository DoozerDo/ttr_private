import { FALLBACK_RENDERED_TEXT, sanitizeRenderedTextList, sanitizeRenderedTextValue } from "@/lib/renderedText";

export type EvidenceSourceLabel = "Verified baseline" | "Added via gap resolution";

export type EvidenceLedgerEntry = {
  id: string;
  text: string;
  sourceLabel?: EvidenceSourceLabel;
};

export type EvidenceLedger = {
  entries: EvidenceLedgerEntry[];
  remainingWeakAreas: string[];
  generationAllowedReason: string | null;
};

type AnalysisLike = {
  supportingSignals?: unknown;
  baselineEvidence?: unknown;
  verification_coverage?: {
    unverifiedRequirements?: string[] | null;
  } | null;
};

function normalizeText(value: string): string {
  const cleaned = sanitizeRenderedTextValue(value, {
    endpoint: "evidenceLedger",
    field: "normalizeText",
  });
  return cleaned === FALLBACK_RENDERED_TEXT ? "" : cleaned;
}

function maybeAddedViaGapResolution(record: Record<string, unknown>): boolean {
  const fields = [record.source, record.sourceType, record.origin, record.provenance]
    .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
    .filter(Boolean);
  return fields.some((value) => value.includes("interview") || value.includes("addition") || value.includes("gap"));
}

function pushEntry(target: EvidenceLedgerEntry[], seen: Set<string>, text: string, sourceLabel?: EvidenceSourceLabel) {
  const normalized = normalizeText(text);
  if (!normalized) return;
  const dedupeKey = normalized.toLowerCase();
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  target.push({
    id: `evidence-${seen.size}`,
    text: normalized,
    sourceLabel,
  });
}

export function deriveEvidenceLedger(input: AnalysisLike | null, options?: { generationAllowed?: boolean }): EvidenceLedger {
  if (!input) {
    return {
      entries: [],
      remainingWeakAreas: [],
      generationAllowedReason: null,
    };
  }

  const entries: EvidenceLedgerEntry[] = [];
  const seen = new Set<string>();

  if (Array.isArray(input.supportingSignals)) {
    for (const signal of input.supportingSignals) {
      if (typeof signal === "string") {
        pushEntry(entries, seen, signal, "Verified baseline");
        continue;
      }
      if (signal && typeof signal === "object") {
        const record = signal as Record<string, unknown>;
        const text =
          typeof record.label === "string"
            ? sanitizeRenderedTextValue(record.label, {
                endpoint: "evidenceLedger",
                field: "supportingSignals.label",
              })
            : typeof record.name === "string"
              ? sanitizeRenderedTextValue(record.name, {
                  endpoint: "evidenceLedger",
                  field: "supportingSignals.name",
                })
              : "";
        if (!text) continue;
        pushEntry(
          entries,
          seen,
          text,
          maybeAddedViaGapResolution(record) ? "Added via gap resolution" : "Verified baseline",
        );
      }
    }
  }

  if (typeof input.baselineEvidence === "string") {
    pushEntry(entries, seen, input.baselineEvidence, "Verified baseline");
  } else if (Array.isArray(input.baselineEvidence)) {
    for (const item of input.baselineEvidence) {
      if (typeof item === "string") {
        pushEntry(entries, seen, item, "Verified baseline");
        continue;
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const text =
          typeof record.text === "string"
            ? sanitizeRenderedTextValue(record.text, {
                endpoint: "evidenceLedger",
                field: "baselineEvidence.text",
              })
            : typeof record.title === "string"
              ? sanitizeRenderedTextValue(record.title, {
                  endpoint: "evidenceLedger",
                  field: "baselineEvidence.title",
                })
              : "";
        if (!text) continue;
        pushEntry(
          entries,
          seen,
          text,
          maybeAddedViaGapResolution(record) ? "Added via gap resolution" : "Verified baseline",
        );
      }
    }
  }

  const remainingWeakAreas = Array.isArray(input.verification_coverage?.unverifiedRequirements)
    ? input.verification_coverage?.unverifiedRequirements
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => normalizeText(item))
        .slice(0, 3)
    : [];

  return {
    entries: entries.slice(0, 5),
    remainingWeakAreas,
    generationAllowedReason: options?.generationAllowed ? "This role meets the threshold for tailored output." : null,
  };
}
