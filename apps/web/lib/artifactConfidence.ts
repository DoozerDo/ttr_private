import type { GenerationProductConfidence } from "@/lib/generationProductReadiness";
import { normalizeUserFacingRequirementLabel } from "@/lib/generationReadiness";
import { WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR } from "@shared/workflowThresholds";
import { FALLBACK_RENDERED_TEXT, sanitizeRenderedTextList, sanitizeRenderedTextValue } from "@/lib/renderedText";

export type ArtifactType = "resume" | "cover_letter";
export type ArtifactConfidence = "HIGH" | "MEDIUM" | "LOW";
export type ArtifactVerificationStatus = "VERIFIED" | "INFERRED" | "UNVERIFIED";

export type ArtifactClaimRef = {
  id: string;
  text: string;
  baselineItem: string;
  verificationStatus: ArtifactVerificationStatus;
  artifactType: ArtifactType;
};

export type ArtifactQualityModel = {
  confidence: ArtifactConfidence;
  artifactScore: number;
  missingEvidenceCount: number;
  improvableClaims: ArtifactClaimRef[];
  totalClaimCount: number;
  verifiedClaimCount: number;
};

export type ArtifactQualityTransition = {
  initialConfidence: ArtifactConfidence;
  finalConfidence: ArtifactConfidence;
  artifactScoreDelta: number;
  confidenceUpgraded: boolean;
};

type CoverageShape = {
  totalClaims?: number | null;
  verifiedClaims?: number | null;
  inferredClaims?: number | null;
  unverifiedClaims?: number | null;
  unverifiedRequirements?: string[] | null;
  verifiedRequirements?: string[] | null;
  inferredRequirements?: string[] | null;
  supportedRequirements?: string[] | null;
};

type VerificationIssueShape = {
  claim?: string | null;
  claimStatus?: ArtifactVerificationStatus | undefined;
  explanation?: string | null;
  sourceContext?: string | null;
};

export type ArtifactQualityInput = {
  artifactType: ArtifactType;
  score: number | null;
  productConfidence: GenerationProductConfidence;
  verificationCoverage?: CoverageShape | null;
  verificationIssues?: VerificationIssueShape[];
  baselineEvidence?: unknown;
  summary?: unknown;
  verifiedClaimTexts?: string[];
  dismissedClaimTexts?: string[];
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  const cleaned = sanitizeRenderedTextValue(value, {
    endpoint: "artifactConfidence",
    field: "cleanText",
  });
  return cleaned === FALLBACK_RENDERED_TEXT ? "" : cleaned;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return sanitizeRenderedTextList(
    values.filter((value): value is string => typeof value === "string"),
    {
      endpoint: "artifactConfidence",
      field: "cleanList",
    },
  ).filter((value) => value !== FALLBACK_RENDERED_TEXT);
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function readBaselineItem(baselineEvidence: unknown, summary: unknown): string {
  if (typeof baselineEvidence === "string" && baselineEvidence.trim()) {
    const cleaned = sanitizeRenderedTextValue(baselineEvidence, {
      endpoint: "artifactConfidence",
      field: "baselineEvidence",
    });
    return cleaned === FALLBACK_RENDERED_TEXT ? "" : cleaned;
  }
  if (Array.isArray(baselineEvidence)) {
    for (const entry of baselineEvidence) {
      const text = cleanText(entry);
      if (text) return text;
    }
  }
  const summaryText = cleanText(summary);
  return summaryText || "Verified baseline evidence";
}

function scoreFromCoverage(input: {
  totalClaims: number;
  verifiedClaims: number;
  inferredClaims: number;
}): number {
  if (input.totalClaims <= 0) return 0;
  const raw = ((input.verifiedClaims + input.inferredClaims * 0.5) / input.totalClaims) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function uniqueById(claims: ArtifactClaimRef[]): ArtifactClaimRef[] {
  const seen = new Set<string>();
  const result: ArtifactClaimRef[] = [];
  for (const claim of claims) {
    if (seen.has(claim.id)) continue;
    seen.add(claim.id);
    result.push(claim);
  }
  return result;
}

function buildClaimRef(input: {
  text: string;
  artifactType: ArtifactType;
  status: ArtifactVerificationStatus;
  baselineItem: string;
}): ArtifactClaimRef {
  const normalized = normalizeKey(input.text);
  return {
    id: `${input.artifactType}:${normalized}`,
    text: sanitizeRenderedTextValue(input.text, {
      endpoint: "artifactConfidence",
      field: "claim.text",
    }),
    baselineItem: sanitizeRenderedTextValue(input.baselineItem, {
      endpoint: "artifactConfidence",
      field: "claim.baselineItem",
    }),
    verificationStatus: input.status,
    artifactType: input.artifactType,
  };
}

export function buildArtifactQualityModel(input: ArtifactQualityInput): ArtifactQualityModel {
  const baselineItem = readBaselineItem(input.baselineEvidence, input.summary);
  const verifiedClaimTexts = new Set(cleanList(input.verifiedClaimTexts).map(normalizeKey));
  const dismissedClaimTexts = new Set(cleanList(input.dismissedClaimTexts).map(normalizeKey));
  const coverage = input.verificationCoverage ?? {};

  const coverageVerified = Math.max(0, Number(coverage.verifiedClaims ?? 0) || 0);
  const coverageInferred = Math.max(0, Number(coverage.inferredClaims ?? 0) || 0);

  const claimRefs: ArtifactClaimRef[] = [];
  const coverageClaims = [
    ...cleanList(coverage.unverifiedRequirements),
    ...cleanList(coverage.verifiedRequirements),
    ...cleanList(coverage.inferredRequirements),
    ...cleanList(coverage.supportedRequirements),
  ];
  const coverageVerifiedClaims = new Set(cleanList(coverage.verifiedRequirements).map(normalizeKey));
  const coverageInferredClaims = new Set(cleanList(coverage.inferredRequirements).map(normalizeKey));

  for (const claim of coverageClaims) {
    const normalized = normalizeKey(claim);
    if (!normalized) continue;
    const status: ArtifactVerificationStatus = verifiedClaimTexts.has(normalized)
      ? "VERIFIED"
      : coverageVerifiedClaims.has(normalized)
        ? "VERIFIED"
        : coverageInferredClaims.has(normalized)
          ? "INFERRED"
          : "UNVERIFIED";
    claimRefs.push(
      buildClaimRef({
        text: claim,
        artifactType: input.artifactType,
        status,
        baselineItem,
      }),
    );
  }

  if (!claimRefs.length && Array.isArray(input.verificationIssues)) {
    for (const issue of input.verificationIssues) {
      const claimText = normalizeUserFacingRequirementLabel(issue.claim ?? null, {
        sourceContext: issue.sourceContext,
        issueCode: "unsupported_technology_claim",
      });
      if (!claimText) continue;
      claimRefs.push(
        buildClaimRef({
          text: claimText,
          artifactType: input.artifactType,
          status:
            verifiedClaimTexts.has(normalizeKey(claimText))
              ? "VERIFIED"
              : issue.claimStatus ?? "UNVERIFIED",
          baselineItem: issue.sourceContext?.trim() || baselineItem,
        }),
      );
    }
  }

  const improvableClaims = uniqueById(
    claimRefs.filter((claim) => claim.verificationStatus !== "VERIFIED"),
  ).filter((claim) => !dismissedClaimTexts.has(normalizeKey(claim.text)));
  const totalClaimCount = Math.max(
    Number(coverage.totalClaims ?? 0) || 0,
    claimRefs.length,
    verifiedClaimTexts.size + improvableClaims.length,
  );
  const verifiedClaimCount = Math.max(
    0,
    Math.min(totalClaimCount, coverageVerified + verifiedClaimTexts.size),
  );
  const inferredClaimCount = Math.max(0, Math.min(totalClaimCount, coverageInferred));
  const missingEvidenceCount = Math.max(
    0,
    totalClaimCount - verifiedClaimCount - inferredClaimCount,
  );

  const score = scoreFromCoverage({
    totalClaims: totalClaimCount,
    verifiedClaims: verifiedClaimCount,
    inferredClaims: inferredClaimCount,
  });

  const confidence: ArtifactConfidence =
    typeof input.score === "number" && input.score >= WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR
      ? missingEvidenceCount === 0
        ? "HIGH"
        : "MEDIUM"
      : "LOW";

  return {
    confidence,
    artifactScore:
      score ||
      (confidence === "HIGH"
        ? 100
        : confidence === "MEDIUM"
          ? 70
          : input.productConfidence === "HIGH"
            ? 80
            : 45),
    missingEvidenceCount,
    improvableClaims,
    totalClaimCount,
    verifiedClaimCount,
  };
}

export function deriveArtifactConfidenceTransition(input: {
  previous: ArtifactQualityModel | null;
  next: ArtifactQualityModel | null;
}): ArtifactQualityTransition | null {
  if (!input.previous || !input.next) return null;
  return {
    initialConfidence: input.previous.confidence,
    finalConfidence: input.next.confidence,
    artifactScoreDelta: input.next.artifactScore - input.previous.artifactScore,
    confidenceUpgraded:
      input.previous.confidence !== "HIGH" && input.next.confidence === "HIGH",
  };
}
