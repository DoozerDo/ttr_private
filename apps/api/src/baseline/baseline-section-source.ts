import { Baseline } from './baseline.entity';
import { BaselineSection } from './baseline-section.entity';

export function resolveBaselineSectionsForGeneration(
  baseline: Pick<Baseline, 'id' | 'sections' | 'parsedRecords'>,
): BaselineSection[] {
  return (baseline.sections ?? []).slice().sort((a, b) => a.order - b.order);
}
