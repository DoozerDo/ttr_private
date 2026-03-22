import { validateStatementIntegrity } from './statement-integrity';
import { ComplianceTextSection, GeneratedTextSourceType } from './compliance.types';
import { classifyResumeLine, ResumeLineType } from './resume-line-classifier';

export type EntityType =
  | 'company'
  | 'technology'
  | 'concept'
  | 'derived'
  | 'operational_descriptor';

export type StructuredClaim = {
  text: string;
  type: EntityType;
};

export type ClaimUnit = {
  text: string;
  claim: StructuredClaim;
  sourceType: GeneratedTextSourceType;
  sectionTitle?: string | null;
  integrityValid: boolean;
  integrityReason?: string;
  lineType: ResumeLineType;
};

type ClaimUnitOptions = {
  baselineOnly?: boolean;
  enforceIntegrityForBaseline?: boolean;
  includeBaselineEvidenceFragments?: boolean;
  includeSkillStacks?: boolean;
  entityTypeResolver?: (text: string) => EntityType;
};

const INVALID_SINGLE_TOKEN_DESCRIPTORS = new Set([
  'scalable',
  'strategic',
  'high-impact',
  'impactful',
  'collaborative',
  'dynamic',
]);

const INVALID_HYPHENATED_DESCRIPTOR_PATTERNS: RegExp[] = [
  /^[a-z0-9]+-impacting$/i,
  /^[a-z0-9]+-focused$/i,
  /^[a-z0-9]+-driven$/i,
  /^[a-z0-9]+-facing$/i,
  /^[a-z0-9]+-team$/i,
  /^[a-z0-9]+-response$/i,
  /^[a-z0-9]+-volume$/i,
  /^[a-z0-9]+-channel$/i,
];
const OPERATIONAL_DESCRIPTOR_PATTERNS: RegExp[] = [
  /^[a-z0-9]+-response$/i,
  /^[a-z0-9]+-volume$/i,
  /^[a-z0-9]+-team$/i,
  /^[a-z0-9]+-facing$/i,
  /^[a-z0-9]+-channel$/i,
];
const OPERATIONAL_DESCRIPTOR_PHRASES = new Set([
  'first response',
  'high volume',
  'cross team',
  'customer facing',
]);

const KNOWN_TOOL_ENABLED_PHRASES = new Set([
  'salesforce-enabled',
  'zendesk-enabled',
  'servicenow-enabled',
  'five9-enabled',
  'kubernetes-enabled',
]);

export function isValidClaim(claim: string): boolean {
  const normalized = String(claim ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const lower = normalized.toLowerCase();
  if (isOperationalDescriptor(lower)) return false;
  if (INVALID_SINGLE_TOKEN_DESCRIPTORS.has(lower)) return false;
  if (INVALID_HYPHENATED_DESCRIPTOR_PATTERNS.some((pattern) => pattern.test(lower))) {
    return false;
  }

  if ((/-enabled$/i.test(normalized) || /\benabled$/i.test(normalized)) && !KNOWN_TOOL_ENABLED_PHRASES.has(lower)) {
    return false;
  }

  return true;
}

export function isOperationalDescriptor(claim: string): boolean {
  const normalized = String(claim ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return false;
  if (OPERATIONAL_DESCRIPTOR_PHRASES.has(normalized)) return true;
  if (OPERATIONAL_DESCRIPTOR_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return false;
}

function classifyClaimEntityType(claim: string): EntityType {
  if (isOperationalDescriptor(claim)) return 'operational_descriptor';
  if (isValidClaim(claim)) return 'derived';
  return 'derived';
}

function splitTextIntoUnits(text: string): string[] {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) =>
      line
        .replace(/^[\-*\u2022\u25CF\u25E6\u2043\u2219]\s+/, '')
        .trim(),
    )
    .filter(Boolean);
}

export function extractClaimUnitsFromSections(
  sections: ComplianceTextSection[] | null | undefined,
  options?: ClaimUnitOptions,
): ClaimUnit[] {
  const baselineOnly = options?.baselineOnly ?? false;
  const enforceIntegrityForBaseline = options?.enforceIntegrityForBaseline ?? true;
  const includeBaselineEvidenceFragments =
    options?.includeBaselineEvidenceFragments ?? false;
  const includeSkillStacks = options?.includeSkillStacks ?? false;
  const units: ClaimUnit[] = [];

  for (const section of sections ?? []) {
    const sectionSourceType =
      section.sourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE;
    const sentenceSources = Array.isArray(section.sentenceSources)
      ? section.sentenceSources
      : [];

    const candidates =
      sentenceSources.length > 0
        ? sentenceSources
            .map((sentence) => ({
              text: String(sentence?.text ?? ''),
              sourceType:
                sentence?.sourceType ??
                sectionSourceType ??
                GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
            }))
            .filter((entry) => entry.text.trim().length > 0)
        : [
            ...(section.title
              ? splitTextIntoUnits(section.title).map((text) => ({
                  text,
                  sourceType:
                    sectionSourceType ??
                    GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
                }))
              : []),
            ...splitTextIntoUnits(section.content ?? '').map((text) => ({
              text,
              sourceType:
                sectionSourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
            })),
          ];

    for (const candidate of candidates) {
      if (baselineOnly && candidate.sourceType !== GeneratedTextSourceType.BASELINE_EVIDENCE) {
        continue;
      }

      const normalized = candidate.text.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      if (!isValidClaim(normalized)) continue;
      const lineType = classifyResumeLine(normalized);

      if (lineType === ResumeLineType.NOISE) {
        continue;
      }
      if (lineType === ResumeLineType.SKILL_STACK && !includeSkillStacks) {
        continue;
      }
      if (
        lineType === ResumeLineType.BULLET_EVIDENCE_FRAGMENT &&
        !(
          candidate.sourceType === GeneratedTextSourceType.BASELINE_EVIDENCE &&
          includeBaselineEvidenceFragments
        )
      ) {
        continue;
      }

      let integrityValid = true;
      let integrityReason: string | undefined;
      if (
        enforceIntegrityForBaseline &&
        candidate.sourceType === GeneratedTextSourceType.BASELINE_EVIDENCE
      ) {
        if (
          lineType === ResumeLineType.BULLET_EVIDENCE_FRAGMENT &&
          includeBaselineEvidenceFragments
        ) {
          integrityValid = true;
          integrityReason = undefined;
        } else if (
          lineType === ResumeLineType.SKILL_STACK &&
          includeSkillStacks
        ) {
          integrityValid = true;
          integrityReason = undefined;
        } else {
          const integrity = validateStatementIntegrity(normalized, {
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          });
          integrityValid = integrity.valid;
          integrityReason = integrity.valid ? undefined : integrity.reason;
        }
      }

      if (!integrityValid) continue;

      units.push({
        text: normalized,
        claim: {
          text: normalized,
          type: options?.entityTypeResolver
            ? options.entityTypeResolver(normalized)
            : classifyClaimEntityType(normalized),
        },
        sourceType: candidate.sourceType,
        sectionTitle: section.title,
        integrityValid,
        integrityReason,
        lineType,
      });
    }
  }

  const deduped = new Set<string>();
  const result: ClaimUnit[] = [];
  for (const unit of units) {
    const key = `${unit.sourceType}::${unit.text.toLowerCase()}`;
    if (deduped.has(key)) continue;
    deduped.add(key);
    result.push(unit);
  }

  return result;
}
