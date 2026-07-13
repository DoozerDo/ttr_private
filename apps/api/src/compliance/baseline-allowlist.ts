import { ComplianceTextSection } from './compliance.types';
import {
  collectCandidates,
  collectMetricCandidatesFromSections,
  collectTechnologyClaimsFromSections,
  extractBaselineCompanyTokens,
  extractCompanyCandidatesFromText,
  extractRoleCandidatesFromText,
  normalizeCompanyTokenForComparison,
  normalizeTokenForComparison,
  shouldUseForRoleDetection,
} from './detectors';
import {
  BaselineAllowlistSnapshot,
  EMPTY_BASELINE_ALLOWLIST,
} from './baseline-allowlist.types';

export function buildBaselineAllowlistSnapshot(
  sections: ComplianceTextSection[] | null | undefined,
): BaselineAllowlistSnapshot {
  if (!sections?.length) {
    return { ...EMPTY_BASELINE_ALLOWLIST };
  }

  const normalizedSections = (sections ?? []).filter((section) => {
    const type = section.sectionType?.toUpperCase?.();
    return type !== 'RAW';
  });

  const companyTokens = new Set<string>();

  for (const token of extractBaselineCompanyTokens(normalizedSections)) {
    const normalized = normalizeCompanyTokenForComparison(token);
    if (normalized) {
      companyTokens.add(normalized);
    }
  }

  const candidateCompanies = collectCandidates(
    normalizedSections,
    extractCompanyCandidatesFromText,
    normalizeCompanyTokenForComparison,
  );
  for (const normalized of candidateCompanies.keys()) {
    if (normalized) {
      companyTokens.add(normalized);
    }
  }

  const roleSections = normalizedSections.filter((section) =>
    shouldUseForRoleDetection(section.sectionType),
  );
  const roleCandidates = collectCandidates(
    roleSections,
    extractRoleCandidatesFromText,
    normalizeTokenForComparison,
  );

  const metricTokens = new Set<string>();
  const metricCandidates =
    collectMetricCandidatesFromSections(normalizedSections);
  for (const candidate of metricCandidates) {
    if (candidate.normalized) {
      metricTokens.add(candidate.normalized);
    }
  }

  const technologyTokens = new Set<string>();
  for (const claim of collectTechnologyClaimsFromSections(normalizedSections).values()) {
    const normalized = normalizeTokenForComparison(claim.text);
    if (normalized) {
      technologyTokens.add(normalized);
    }
  }

  return {
    allowedCompanies: [...companyTokens].sort(),
    allowedRoles: [...roleCandidates.keys()].sort(),
    allowedTechnologies: [...technologyTokens].sort(),
    allowedMetricTokens: [...metricTokens].sort(),
  };
}
