import { BaselineIncludePolicy } from '../baseline/baseline-section.entity';
import { getCharCount } from '../common/text-metrics';
import { selectBaselineTextForScoring } from './baseline-selection';

const buildBaselineSection = (id: string, content: string) => ({
  id,
  baselineId: 'baseline-1',
  sectionType: 'EXPERIENCE',
  title: null,
  content,
  includePolicy: BaselineIncludePolicy.OPTIONAL,
  order: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('selectBaselineTextForScoring', () => {
  const canonicalSections = [
    { type: 'SKILLS', content: 'AWS, Kubernetes' },
  ];

  it('includes the full section text when no selection filter is provided', () => {
    const baseline = {
      sections: [
        buildBaselineSection('s1', 'A'.repeat(800)),
        buildBaselineSection('s2', 'B'.repeat(600)),
      ],
    } as any;

    const result = selectBaselineTextForScoring({
      baseline,
      canonicalSections,
    });

    expect(result.includedBaselineChars).toEqual(1400);
    expect(result.originalBaselineChars).toEqual(1400);
    expect(result.source).toBe('baseline_sections');
    expect(result.selectedSectionGateActive).toBe(false);
    expect(result.selectedSectionCount).toBe(2);
  });

  it('honors selected section filters when provided', () => {
    const baseline = {
      sections: [
        buildBaselineSection('s1', 'A'.repeat(800)),
        buildBaselineSection('s2', 'B'.repeat(600)),
      ],
    } as any;

    const result = selectBaselineTextForScoring({
      baseline,
      normalizedSelectedBlockIds: ['s2'],
      canonicalSections,
    });

    expect(result.includedBaselineChars).toEqual(600);
    expect(result.originalBaselineChars).toEqual(1400);
    expect(result.source).toBe('selectedBaselineSections');
    expect(result.selectedSectionGateActive).toBe(true);
    expect(result.selectedSectionIds).toEqual(['s2']);
  });

  it('falls back to canonical sections when baseline text is missing', () => {
    const baseline = {
      sections: [],
    } as any;

    const result = selectBaselineTextForScoring({
      baseline,
      canonicalSections,
    });

    const canonicalChars = getCharCount('AWS, Kubernetes');
    expect(result.includedBaselineChars).toEqual(canonicalChars);
    expect(result.originalBaselineChars).toEqual(canonicalChars);
    expect(result.source).toBe('baseline_parsed');
    expect(result.selectedSectionCount).toBe(0);
    expect(result.selectedSectionGateActive).toBe(false);
  });
});
