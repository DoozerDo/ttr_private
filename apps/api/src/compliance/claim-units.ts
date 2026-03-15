import { validateStatementIntegrity } from './statement-integrity';
import { ComplianceTextSection, GeneratedTextSourceType } from './compliance.types';

export type ClaimUnit = {
  text: string;
  sourceType: GeneratedTextSourceType;
  sectionTitle?: string | null;
  integrityValid: boolean;
  integrityReason?: string;
};

type ClaimUnitOptions = {
  baselineOnly?: boolean;
  enforceIntegrityForBaseline?: boolean;
};

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
        : splitTextIntoUnits([section.title, section.content].filter(Boolean).join(' ')).map(
            (text) => ({
              text,
              sourceType:
                sectionSourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
            }),
          );

    for (const candidate of candidates) {
      if (baselineOnly && candidate.sourceType !== GeneratedTextSourceType.BASELINE_EVIDENCE) {
        continue;
      }

      const normalized = candidate.text.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;

      let integrityValid = true;
      let integrityReason: string | undefined;
      if (
        enforceIntegrityForBaseline &&
        candidate.sourceType === GeneratedTextSourceType.BASELINE_EVIDENCE
      ) {
        const integrity = validateStatementIntegrity(normalized, {
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        });
        integrityValid = integrity.valid;
        integrityReason = integrity.valid ? undefined : integrity.reason;
      }

      if (!integrityValid) continue;

      units.push({
        text: normalized,
        sourceType: candidate.sourceType,
        sectionTitle: section.title,
        integrityValid,
        integrityReason,
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
