export type AnalysisResult = {
  ok?: boolean;
  assessmentId?: string;
  jobId?: string;
  baselineId?: string;
  baselineVersion?: number | null;
  fit_score?: number;
  overall_score?: number;
  overallScore?: number;
  score: number;
  verdict?: "APPLY" | "CONSIDER" | "SKIP";
  breakdown?: {
    experience_alignment: number;
    leadership_level: number;
    technical_platform_fit: number;
    industry_context: number;
    strategic_vs_tactical: number;
  };
  dimensionScores?: {
    experienceAlignment: number;
    leadershipLevel: number;
    technicalPlatformFit: number;
    industryContext: number;
    strategicTacticalFit: number;
  };
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  complianceFlags?:
    | string[]
    | {
        [key: string]: string | number | boolean | null | undefined;
      };
  compliance_flags?: Array<{ code: string; message?: string | null }>;
  recommendedActions?: string[];
  debug?: unknown;
};

export type StoredPayload = {
  result: AnalysisResult;
  savedAt: string;
};

const STORAGE_KEY = "ttr:lastAnalysis";

export async function saveLastAnalysis(payload: StoredPayload) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function normalizeAnalysisResult(raw: any): AnalysisResult {
  const fitScore =
    raw?.score ??
    raw?.overallScore ??
    raw?.overall_score ??
    raw?.fit_score ??
    null;

  const breakdown =
    raw?.breakdown && typeof raw.breakdown === "object"
      ? raw.breakdown
      : undefined;

  const mappedDimensions =
    raw?.dimensionScores ??
    (breakdown
      ? {
          experienceAlignment: breakdown.experience_alignment,
          leadershipLevel: breakdown.leadership_level,
          technicalPlatformFit: breakdown.technical_platform_fit,
          industryContext: breakdown.industry_context,
          strategicTacticalFit: breakdown.strategic_vs_tactical,
        }
      : undefined);

  const complianceFlags =
    raw?.complianceFlags ??
    raw?.compliance_flags?.map((flag: { code: string; message?: string }) =>
      flag?.code ? flag.code : flag,
    ) ??
    undefined;

  const verdict = raw?.verdict
    ? String(raw.verdict).toUpperCase()
    : raw?.verdict;

  return {
    ...raw,
    verdict,
    breakdown,
    dimensionScores: mappedDimensions,
    complianceFlags,
    fit_score: raw?.fit_score,
    overall_score: raw?.overall_score,
    overallScore:
      raw?.overallScore ??
      raw?.overall_score ??
      raw?.fit_score ??
      raw?.score ??
      undefined,
    score:
      typeof fitScore === "number"
        ? fitScore
        : typeof raw?.fit_score === "number"
          ? raw.fit_score
          : 0,
    strengths: raw?.strengths ?? [],
    gaps: raw?.gaps ?? [],
  };
}
