import {
  ComplianceTextSection,
  GeneratedTextSourceType,
} from './compliance.types';
import { extractClaimUnitsFromSections, type EntityType } from './claim-units';
import { ResumeLineType } from './resume-line-classifier';

export type ComparableComplianceUnit = {
  text: string;
  claim: { text: string; type: EntityType };
  normalized: string;
  sourceType: GeneratedTextSourceType;
  sectionType?: string | null;
  sectionTitle?: string | null;
  sectionIndex?: number;
  candidateIndex?: number;
  integrityValid: boolean;
  integrityReason?: string;
  lineType: ResumeLineType;
};

type BuildComparableComplianceUnitsOptions = {
  baselineOnly?: boolean;
  enforceIntegrityForBaseline?: boolean;
  sourceType?: GeneratedTextSourceType;
  includeInvalidIntegrity?: boolean;
  includeBaselineEvidenceFragments?: boolean;
  includeSkillStacks?: boolean;
  filter?: (unit: ComparableComplianceUnit) => boolean;
};

export function normalizeComparableComplianceText(value: string): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildComparableComplianceUnits(
  sections: ComplianceTextSection[] | null | undefined,
  options?: BuildComparableComplianceUnitsOptions,
): ComparableComplianceUnit[] {
  const units = extractClaimUnitsFromSections(sections, {
    baselineOnly: options?.baselineOnly ?? false,
    enforceIntegrityForBaseline: options?.enforceIntegrityForBaseline ?? true,
    includeBaselineEvidenceFragments:
      options?.includeBaselineEvidenceFragments ?? false,
    includeSkillStacks: options?.includeSkillStacks ?? false,
  });

  const includeInvalidIntegrity = options?.includeInvalidIntegrity ?? false;
  const output: ComparableComplianceUnit[] = [];

  for (const unit of units) {
    if (options?.sourceType && unit.sourceType !== options.sourceType) {
      continue;
    }
    if (!includeInvalidIntegrity && !unit.integrityValid) {
      continue;
    }

    const normalized = normalizeComparableComplianceText(unit.text);
    if (!normalized) continue;

    const comparable: ComparableComplianceUnit = {
      text: unit.text,
      claim: unit.claim,
      normalized,
      sourceType: unit.sourceType,
      sectionType: unit.sectionType ?? null,
      sectionTitle: unit.sectionTitle,
      sectionIndex: unit.sectionIndex,
      candidateIndex: unit.candidateIndex,
      integrityValid: unit.integrityValid,
      integrityReason: unit.integrityReason,
      lineType: unit.lineType,
    };

    if (options?.filter && !options.filter(comparable)) {
      continue;
    }

    output.push(comparable);
  }

  const deduped = new Set<string>();
  const result: ComparableComplianceUnit[] = [];
  for (const unit of output) {
    const key = `${unit.sourceType}::${unit.normalized}`;
    if (deduped.has(key)) continue;
    deduped.add(key);
    result.push(unit);
  }

  return result;
}
