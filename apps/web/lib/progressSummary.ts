import { buildScoreDelta, type ReanalysisAnalysis } from "@/lib/reanalysis";

type GapLike = string | { title?: string | null };

type ProgressAnalysis = ReanalysisAnalysis & {
  gaps?: GapLike[] | null;
  criticalGaps?: Array<{
    title?: string | null;
  }> | null;
  verification_coverage?: {
    unverifiedRequirements?: string[] | null;
  } | null;
};

export type ProgressSummary = {
  scoreChange: number;
  gapsClosed: string[];
  gapsRemaining: string[];
  gapsNew: string[];
  improvementDetected: boolean;
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Map(values.map((value) => [normalize(value), value.trim()])).values()).filter(
    Boolean,
  );
}

function collectGapLabels(analysis: ProgressAnalysis | null): string[] {
  if (!analysis) return [];
  const labels: string[] = [];
  if (Array.isArray(analysis.gaps)) {
    for (const gap of analysis.gaps) {
      if (typeof gap === "string" && gap.trim()) labels.push(gap.trim());
      if (gap && typeof gap === "object" && typeof gap.title === "string" && gap.title.trim()) {
        labels.push(gap.title.trim());
      }
    }
  }
  if (Array.isArray(analysis.criticalGaps)) {
    for (const gap of analysis.criticalGaps) {
      if (typeof gap?.title === "string" && gap.title.trim()) labels.push(gap.title.trim());
    }
  }
  if (Array.isArray(analysis.verification_coverage?.unverifiedRequirements)) {
    for (const item of analysis.verification_coverage?.unverifiedRequirements ?? []) {
      if (typeof item === "string" && item.trim()) labels.push(item.trim());
    }
  }
  return unique(labels);
}

export function buildProgressSummary(
  previousAnalysis: ProgressAnalysis | null,
  currentAnalysis: ProgressAnalysis | null,
): ProgressSummary {
  const delta = buildScoreDelta(previousAnalysis, currentAnalysis);
  const previousGaps = collectGapLabels(previousAnalysis);
  const currentGaps = collectGapLabels(currentAnalysis);
  const previousSet = new Set(previousGaps.map(normalize));
  const currentSet = new Set(currentGaps.map(normalize));

  const gapsClosed = previousGaps.filter((gap) => !currentSet.has(normalize(gap)));
  const gapsRemaining = currentGaps.filter((gap) => previousSet.has(normalize(gap)));
  const gapsNew = currentGaps.filter((gap) => !previousSet.has(normalize(gap)));
  const improvementDetected = (delta.delta ?? 0) > 0 || gapsClosed.length > 0;

  return {
    scoreChange: delta.delta ?? 0,
    gapsClosed,
    gapsRemaining,
    gapsNew,
    improvementDetected,
  };
}
