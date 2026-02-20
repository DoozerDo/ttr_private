import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { getCharCount } from '../common/text-metrics';

export type BaselineSectionPayload = {
  type?: string;
  content: string;
};

export type ValidBaselineSectionPayload = {
  type: BaselineSectionType;
  content: string;
};

export type BaselineTextSelectionResult = {
  sectionsForScoring: ValidBaselineSectionPayload[];
  normalizedBaselineText: string;
  originalBaselineChars: number;
  includedBaselineChars: number;
  selectedSectionIds: string[];
  selectedSectionCount: number;
  selectedSectionGateActive: boolean;
  source: 'baseline_sections' | 'selectedBaselineSections' | 'baseline_parsed';
  selectedSections: Baseline['sections'];
};

export type BaselineTextSelectionInput = {
  baseline: Baseline;
  normalizedSelectedBlockIds?: string[] | null;
  canonicalSections: BaselineSectionPayload[];
};

export function selectBaselineTextForScoring({
  baseline,
  normalizedSelectedBlockIds,
  canonicalSections,
}: BaselineTextSelectionInput): BaselineTextSelectionResult {
  const availableSections = (baseline.sections ?? []).filter(
    (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
  );
  const availableText = availableSections
    .map((section) => section.content ?? '')
    .join('\n');
  const originalBaselineChars = getCharCount(availableText);

  const normalizedIds =
    normalizedSelectedBlockIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  let selectedSectionGateActive = normalizedIds.length > 0;
  const selectedSections = selectedSectionGateActive
    ? availableSections.filter((section) => section.id && normalizedIds.includes(section.id))
    : availableSections;

  let selectedSectionIds = selectedSections
    .map((section) => section.id ?? '')
    .filter((id): id is string => Boolean(id));

  const selectedText = selectedSections
    .map((section) => section.content ?? '')
    .join('\n');
  let includedBaselineChars = getCharCount(selectedText);
  let sectionsForScoring = selectedSections
    .map((section) => ({
      type: section.sectionType ?? section.type,
      content: section.content ?? '',
    }))
    .filter(isValidBaselineSectionPayload);
  let normalizedBaselineText = selectedText;
  let source: BaselineTextSelectionResult['source'] = selectedSectionGateActive
    ? 'selectedBaselineSections'
    : 'baseline_sections';
  let originalChars = originalBaselineChars;
  let selectedSectionCount = selectedSections.length;

  if (originalBaselineChars === 0 && canonicalSections.length) {
    const canonicalText = canonicalSections.map((section) => section.content ?? '').join('\n');
    sectionsForScoring = canonicalSections
      .filter(isValidBaselineSectionPayload)
      .map((section) => ({
        type: section.type,
        content: section.content,
      }));
    normalizedBaselineText = canonicalText;
    includedBaselineChars = getCharCount(canonicalText);
    source = 'baseline_parsed';
    selectedSectionCount = 0;
    originalChars = includedBaselineChars;
    selectedSectionIds = [];
    selectedSectionGateActive = false;
  }

  return {
    sectionsForScoring,
    normalizedBaselineText,
    originalBaselineChars: originalChars,
    includedBaselineChars,
    selectedSectionIds,
    selectedSectionCount,
    selectedSectionGateActive,
    source,
    selectedSections,
  };
}

const allowedBaselineSectionTypes = Object.values(
  BaselineSectionType,
) as BaselineSectionType[];

function isBaselineSectionType(
  value: unknown,
): value is BaselineSectionType {
  return (
    typeof value === 'string' &&
    allowedBaselineSectionTypes.includes(value as BaselineSectionType)
  );
}

function isValidBaselineSectionPayload(
  section: { type?: unknown; content?: unknown },
): section is ValidBaselineSectionPayload {
  return isBaselineSectionType(section.type) && typeof section.content === 'string';
}
