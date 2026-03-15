import {
  ComplianceTextSection,
  GeneratedTextSourceType,
} from './compliance.types';
import { extractClaimUnitsFromSections } from './claim-units';
import { ResumeLineType } from './resume-line-classifier';

export type ComparableComplianceUnit = {
  text: string;
  normalized: string;
  sourceType: GeneratedTextSourceType;
  sectionTitle?: string | null;
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
      normalized,
      sourceType: unit.sourceType,
      sectionTitle: unit.sectionTitle,
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
