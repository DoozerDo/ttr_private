import type { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import type { BaselineSection } from '../baseline/baseline-section.entity';
import type { ArtifactTraceAudit } from './artifact-trace-audit';
import type { EvidenceItem } from '../evidence/evidence-model';

export type InterpretedEvidenceEligibilityResult = {
  hasMeaningfulInterpretedEvidence: boolean;
  eligibleEvidence: EvidenceItem[];
  omissions: {
    omittedWeakEvidenceIds: string[];
    omittedUnusableEvidenceIds: string[];
    omittedNoToolsOrMetricsIds: string[];
  };
};

const SAFE_PARTIAL_VERB_PHRASES = [
  'built',
  'supported',
  'contributed to',
  'maintained',
  'worked on',
  'helped improve',
  'partnered with',
  'collaborated with',
] as const;

const FORBIDDEN_INFLATION_PHRASES = [
  'transformed',
  'owned',
  'led global strategy',
  'delivered measurable improvement',
  'increased revenue',
  'reduced costs',
  'improved csat',
  'reduced churn',
  'managed teams',
  'enterprise-wide',
] as const;

function normalizeForPhraseMatch(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Constrain interpreted evidence wording before it becomes a synthetic evidence unit.
 *
 * Rules:
 * - Never add metrics/scope/tools/etc. (only filter/omit).
 * - For partial evidence: omit if it contains forbidden inflation phrases, or if it lacks any safe verb phrase.
 * - For strong evidence: keep original text (strong evidence may contain stronger language because it is explicitly present).
 */
export function constrainInterpretedEvidenceTextForGeneration(item: EvidenceItem): string | null {
  const raw = String(item?.text ?? '').trim();
  if (!raw) return null;

  if (item.evidenceStrength === 'strong') {
    return raw;
  }

  if (item.evidenceStrength !== 'partial') {
    return null;
  }

  const normalized = normalizeForPhraseMatch(raw);
  const hasForbidden = FORBIDDEN_INFLATION_PHRASES.some((phrase) => normalized.includes(phrase));
  if (hasForbidden) {
    return null;
  }

  const hasSafeVerb = SAFE_PARTIAL_VERB_PHRASES.some((phrase) => normalized.includes(phrase));
  if (!hasSafeVerb) {
    return null;
  }

  return raw;
}

export function evaluateInterpretedEvidenceEligibility(
  interpretedEvidence: EvidenceItem[] | null | undefined,
): InterpretedEvidenceEligibilityResult {
  const items = interpretedEvidence ?? [];
  const omittedWeakEvidenceIds: string[] = [];
  const omittedUnusableEvidenceIds: string[] = [];
  const omittedNoToolsOrMetricsIds: string[] = [];

  const eligibleEvidence = items.filter((item) => {
    if (item.evidenceStrength === 'weak') {
      omittedWeakEvidenceIds.push(item.id);
      return false;
    }
    if (item.evidenceStrength === 'unusable') {
      omittedUnusableEvidenceIds.push(item.id);
      return false;
    }
    if (item.evidenceStrength !== 'strong' && item.evidenceStrength !== 'partial') {
      return false;
    }
    const tools = Array.isArray(item.extracted?.tools) ? item.extracted?.tools ?? [] : [];
    const metrics = Array.isArray(item.extracted?.metrics) ? item.extracted?.metrics ?? [] : [];
    const hasExplicitSignals = tools.length > 0 || metrics.length > 0;
    if (!hasExplicitSignals) {
      omittedNoToolsOrMetricsIds.push(item.id);
    }
    return hasExplicitSignals;
  });

  return {
    hasMeaningfulInterpretedEvidence: eligibleEvidence.length > 0,
    eligibleEvidence,
    omissions: {
      omittedWeakEvidenceIds,
      omittedUnusableEvidenceIds,
      omittedNoToolsOrMetricsIds,
    },
  };
}

export function buildSyntheticBaselineSectionsFromInterpretedEvidence(opts: {
  eligibleEvidence: EvidenceItem[];
  includePolicy: BaselineIncludePolicy;
  sectionType: BaselineSectionType;
  baseOrder: number;
}): BaselineSection[] {
  const { eligibleEvidence, includePolicy, sectionType, baseOrder } = opts;
  const sections: BaselineSection[] = [];
  eligibleEvidence.forEach((item, index) => {
    const constrained = constrainInterpretedEvidenceTextForGeneration(item);
    if (!constrained) return;
    sections.push({
      id: `interpreted:${item.id}`,
      title: 'Interpreted evidence',
      sectionType,
      order: baseOrder + index,
      content: `- ${constrained}`,
      includePolicy,
      source: 'baseline',
    } as unknown as BaselineSection);
  });
  return sections;
}

export type AllowedBaselineBlockLike = {
  id: string;
  title: string | null;
  content: string;
  includePolicy: BaselineIncludePolicy;
  order: number;
  sectionType: BaselineSectionType;
};

export function buildSyntheticAllowedBlocksFromInterpretedEvidence(opts: {
  eligibleEvidence: EvidenceItem[];
  includePolicy: BaselineIncludePolicy;
  sectionType: BaselineSectionType;
  baseOrder: number;
}): AllowedBaselineBlockLike[] {
  const { eligibleEvidence, includePolicy, sectionType, baseOrder } = opts;
  const blocks: AllowedBaselineBlockLike[] = [];
  eligibleEvidence.forEach((item, index) => {
    const constrained = constrainInterpretedEvidenceTextForGeneration(item);
    if (!constrained) return;
    blocks.push({
      id: `interpreted:${item.id}`,
      title: 'Interpreted evidence',
      content: `- ${constrained}`,
      includePolicy,
      order: baseOrder + index,
      sectionType,
    });
  });
  return blocks;
}

export function buildInterpretedEvidenceIdToItemMapFromSyntheticContainers(opts: {
  syntheticContainers: Array<{ id: string; content: string }>;
  eligibleEvidence: EvidenceItem[];
  reconstructLogicalTextUnits: (text: string) => unknown[];
  extractEvidenceUnitsFromLogicalUnits: (containerId: string, units: unknown[]) => Array<{ id: string }>;
}): Map<string, EvidenceItem> {
  const interpretedEvidenceIdToItem = new Map<string, EvidenceItem>();
  const usableById = new Map<string, EvidenceItem>(opts.eligibleEvidence.map((item) => [item.id, item]));

  for (const container of opts.syntheticContainers) {
    const logicalUnits = opts.reconstructLogicalTextUnits(container.content ?? '');
    const evidenceUnits = opts.extractEvidenceUnitsFromLogicalUnits(String(container.id), logicalUnits);
    const evidenceItemId = String(container.id).slice('interpreted:'.length);
    const item = usableById.get(evidenceItemId);
    if (!item) continue;
    for (const unit of evidenceUnits) {
      interpretedEvidenceIdToItem.set(unit.id, item);
    }
  }

  return interpretedEvidenceIdToItem;
}

export function buildEvidenceDetailsMapFromTraceMap(opts: {
  traceMap: ArtifactTraceAudit['traceMap'];
  interpretedEvidenceByGeneratedEvidenceId: Map<string, EvidenceItem>;
}): ArtifactTraceAudit['evidenceDetailsMap'] {
  const evidenceDetailsMap: Record<string, any[]> = {};
  for (const [lineId, ids] of Object.entries(opts.traceMap ?? {})) {
    const details = (ids ?? [])
      .map((id) => opts.interpretedEvidenceByGeneratedEvidenceId.get(id))
      .filter(Boolean)
      .map((item) => ({
        evidenceItemId: item!.id,
        evidenceStrength: item!.evidenceStrength,
        evidenceSource: item!.evidenceSource,
        supportLevel: item!.supportLevel,
        generationUse: item!.generationUse,
        constraintsApplied: item!.constraints ?? [],
        missingElements: item!.missingElements,
      }));
    if (details.length) evidenceDetailsMap[lineId] = details;
  }
  return Object.keys(evidenceDetailsMap).length ? evidenceDetailsMap : undefined;
}
