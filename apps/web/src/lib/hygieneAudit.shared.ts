export type HygieneCandidateStrength = "Review candidate" | "Strong review candidate";

export type HygieneCandidateBase = {
  path: string;
  ageDays: number | null;
  strength: HygieneCandidateStrength;
  reasons: string[];
};

export type DeadCodeCandidate = HygieneCandidateBase & {
  kind: "file" | "component" | "util" | "script" | "test" | "other";
  inboundReferenceCount: number | null;
  contextNote: string | null;
  extension: string;
};

export type RouteDriftCandidate = HygieneCandidateBase & {
  routePath: string;
  sourceFile: string;
  discoveredInNav: boolean;
};

export type HygieneSummary = {
  totalCandidates: number;
  strongCandidates: number;
  byCategory: Record<string, number>;
};

export type HygieneSnapshot = {
  scannedAt: string;
  deadCode: {
    summary: HygieneSummary;
    candidates: DeadCodeCandidate[];
  };
  routes: {
    summary: HygieneSummary;
    candidates: RouteDriftCandidate[];
  };
};

export function normalizeRepoPath(input: string) {
  return input.split("\\").join("/");
}

export function formatHygieneSummaryText(title: string, scannedAt: string, summary: HygieneSummary) {
  return [
    title,
    `Run: ${scannedAt}`,
    `Total candidates: ${summary.totalCandidates}`,
    `Strong candidates: ${summary.strongCandidates}`,
    ...Object.entries(summary.byCategory).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}

