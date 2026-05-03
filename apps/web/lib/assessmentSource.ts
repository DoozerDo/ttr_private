export type CanonicalAssessmentSummary = {
  assessmentId: string;
  baselineId: string;
  score: number | null;
  createdAt: string | null;
  complianceFlags: unknown[];
  scoringReliability: "ok" | "unreliable";
  scoringReliabilityReason?: string;
};

type AssessmentRecord = {
  assessmentId?: unknown;
  id?: unknown;
  baselineId?: unknown;
  score?: unknown;
  overallScore?: unknown;
  createdAt?: unknown;
  compliance_flags?: unknown;
  complianceFlags?: unknown;
  scoringReliability?: unknown;
  scoringReliabilityReason?: unknown;
};

function normalizeScoringReliability(value: unknown): "ok" | "unreliable" {
  if (value === "unreliable") return "unreliable";
  return "ok";
}

function normalizeScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toAssessmentSummary(record: AssessmentRecord): CanonicalAssessmentSummary | null {
  const assessmentId =
    (typeof record.assessmentId === "string" ? record.assessmentId.trim() : "") ||
    (typeof record.id === "string" ? record.id.trim() : "");
  const baselineId = typeof record.baselineId === "string" ? record.baselineId.trim() : "";
  if (!assessmentId || !baselineId) return null;
  const complianceFlags = Array.isArray(record.compliance_flags)
    ? record.compliance_flags
    : Array.isArray(record.complianceFlags)
      ? record.complianceFlags
      : [];
  const scoringReliability = normalizeScoringReliability(record.scoringReliability);
  const scoringReliabilityReason =
    typeof record.scoringReliabilityReason === "string" && record.scoringReliabilityReason.trim()
      ? record.scoringReliabilityReason.trim()
      : undefined;
  return {
    assessmentId,
    baselineId,
    score: normalizeScore(record.score ?? record.overallScore),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    complianceFlags,
    scoringReliability,
    ...(scoringReliabilityReason ? { scoringReliabilityReason } : {}),
  };
}

export function extractAssessmentsFromPayload(payload: unknown): CanonicalAssessmentSummary[] {
  if (!payload) return [];
  const collection = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { assessments?: unknown[] }).assessments)
      ? ((payload as { assessments: unknown[] }).assessments ?? [])
      : [];
  return collection
    .map((entry) => (entry && typeof entry === "object" ? toAssessmentSummary(entry as AssessmentRecord) : null))
    .filter((entry): entry is CanonicalAssessmentSummary => Boolean(entry));
}

export async function fetchLatestAssessmentForBaseline(
  baselineId: string,
): Promise<CanonicalAssessmentSummary | null> {
  const normalizedBaselineId = baselineId.trim();
  if (!normalizedBaselineId) return null;
  const params = new URLSearchParams({
    baselineId: normalizedBaselineId,
    limit: "1",
  });
  const response = await fetch(`/api/analysis/fit-assessments?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  console.log("SCORING RESPONSE:", response);
  if (!response.ok) return null;
  const payload = await response.json();
  const [latest] = extractAssessmentsFromPayload(payload);
  if (!latest) return null;
  if (latest.baselineId !== normalizedBaselineId) return null;
  return latest;
}
