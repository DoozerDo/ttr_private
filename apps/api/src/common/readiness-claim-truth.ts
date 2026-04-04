import type { FitAssessment } from '../analysis/fit-assessment.entity';
import { normalizeRequirementText } from '../scoring/fit-score/tool-extractor';
import type { ComplianceFlag } from '../compliance/compliance.types';
import { isObviouslyInvalidTechnologyToken } from '../compliance/technology-token-guard';

const normalizedIncludes = (haystack: string, needle: string): boolean => {
  if (!haystack || !needle) return false;
  return haystack.includes(needle) || needle.includes(haystack);
};

export const getCanonicalVerifiedClaimLabels = (
  assessment: FitAssessment | null | undefined,
): Set<string> => {
  const claims = assessment?.scoringV2?.debug?.toolingCoverage?.claims ?? [];
  const labels = claims
    .filter((claim) => claim.status === 'VERIFIED')
    .map((claim) => normalizeRequirementText(claim.label ?? claim.key ?? ''))
    .filter((label) => label.length > 0);
  return new Set(labels);
};

export const filterComplianceFlagsByCanonicalClaims = (
  flags: ComplianceFlag[],
  assessment: FitAssessment | null | undefined,
): ComplianceFlag[] => {
  const verifiedLabels = getCanonicalVerifiedClaimLabels(assessment);

  return flags.filter((flag) => {
    const generatedClaims = (flag.evidence ?? [])
      .map((entry) => entry.generatedClaim)
      .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim))
      .map((claim) => ({
        type: claim.type,
        raw: claim.text ?? '',
        label: normalizeRequirementText(claim.text ?? ''),
      }))
      .filter((claim) => claim.label.length > 0);

    const hasObviouslyInvalidTechnologyClaim = generatedClaims.some(
      (generatedClaim) =>
        generatedClaim.type === 'technology' &&
        isObviouslyInvalidTechnologyToken(generatedClaim.raw),
    );
    if (hasObviouslyInvalidTechnologyClaim) {
      return false;
    }

    if (!verifiedLabels.size) return true;

    const hasResolvedTechnologyClaim = generatedClaims.some((generatedClaim) => {
      if (generatedClaim.type !== 'technology') return false;
      for (const verifiedLabel of verifiedLabels) {
        if (normalizedIncludes(generatedClaim.label, verifiedLabel)) return true;
      }
      return false;
    });

    return !hasResolvedTechnologyClaim;
  });
};
