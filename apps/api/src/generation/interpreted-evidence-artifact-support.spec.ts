import {
  evaluateInterpretedEvidenceEligibility,
  buildSyntheticAllowedBlocksFromInterpretedEvidence,
  buildSyntheticBaselineSectionsFromInterpretedEvidence,
  buildEvidenceDetailsMapFromTraceMap,
  constrainInterpretedEvidenceTextForGeneration,
} from './interpreted-evidence-artifact-support';
import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import type { EvidenceItem } from '../evidence/evidence-model';

describe('interpreted evidence artifact support (shared)', () => {
  const mk = (overrides: Partial<EvidenceItem> & Pick<EvidenceItem, 'id' | 'text'>): EvidenceItem => ({
    id: overrides.id,
    text: overrides.text,
    evidenceStrength: overrides.evidenceStrength ?? 'partial',
    evidenceSource: overrides.evidenceSource ?? 'inferred_from_resume_text',
    supportLevel: overrides.supportLevel ?? 'partial',
    missingElements: overrides.missingElements ?? ['metrics', 'outcome'],
    generationUse: overrides.generationUse ?? 'use_with_constraints',
    extracted: overrides.extracted ?? { tools: ['Node.js'], metrics: null, action: 'built', domain: 'services' },
    constraints: overrides.constraints ?? ['no_invented_metrics', 'use_constrained_language_only'],
  });

  it('applies identical eligibility rules: only strong/partial with explicit tools or metrics', () => {
    const items: EvidenceItem[] = [
      mk({ id: 's-tools', text: 'Built services using Node.js.', evidenceStrength: 'strong', extracted: { tools: ['Node.js'], metrics: null } as any }),
      mk({ id: 'p-metric', text: 'Improved latency by 35%.', evidenceStrength: 'partial', extracted: { tools: null, metrics: ['35%'] } as any }),
      mk({ id: 'p-none', text: 'Built services.', evidenceStrength: 'partial', extracted: { tools: null, metrics: null } as any }),
      mk({ id: 'weak', text: 'Responsible for tasks.', evidenceStrength: 'weak', extracted: { tools: ['AWS'], metrics: null } as any }),
      mk({ id: 'unusable', text: 'Various duties.', evidenceStrength: 'unusable', extracted: { tools: ['PostgreSQL'], metrics: null } as any }),
    ];

    const res = evaluateInterpretedEvidenceEligibility(items);
    expect(res.hasMeaningfulInterpretedEvidence).toBe(true);
    expect(res.eligibleEvidence.map((i) => i.id)).toEqual(['s-tools', 'p-metric']);
    expect(res.omissions.omittedNoToolsOrMetricsIds).toContain('p-none');
    expect(res.omissions.omittedWeakEvidenceIds).toContain('weak');
    expect(res.omissions.omittedUnusableEvidenceIds).toContain('unusable');
  });

  it('creates synthetic resume sections and cover-letter blocks with identical ids/prefix', () => {
    const eligible: EvidenceItem[] = [
      mk({ id: 'e-1', text: 'Built backend services using Node.js.', evidenceStrength: 'partial' }),
      mk({ id: 'e-2', text: 'Improved p95 latency by 35%.', evidenceStrength: 'strong', extracted: { tools: null, metrics: ['35%'] } as any }),
    ];

    const sections = buildSyntheticBaselineSectionsFromInterpretedEvidence({
      eligibleEvidence: eligible,
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      sectionType: BaselineSectionType.SUMMARY,
      baseOrder: 10_000,
    });
    expect(sections.map((s: any) => s.id)).toEqual(['interpreted:e-1', 'interpreted:e-2']);
    expect(String((sections as any)[0].content)).toMatch(/^- /);

    const blocks = buildSyntheticAllowedBlocksFromInterpretedEvidence({
      eligibleEvidence: eligible,
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      sectionType: BaselineSectionType.SUMMARY,
      baseOrder: 1000,
    });
    expect(blocks.map((b) => b.id)).toEqual(['interpreted:e-1', 'interpreted:e-2']);
    expect(String(blocks[0].content)).toMatch(/^- /);
  });

  it('constrains partial evidence wording and omits forbidden inflation phrases', () => {
    const partialOk = mk({
      id: 'p-ok',
      text: 'Built and maintained backend services using Node.js.',
      evidenceStrength: 'partial',
      extracted: { tools: ['Node.js'], metrics: null } as any,
    });
    const partialForbidden = mk({
      id: 'p-bad',
      text: 'Owned enterprise-wide strategy and reduced costs.',
      evidenceStrength: 'partial',
      extracted: { tools: ['Node.js'], metrics: null } as any,
    });
    const partialNoSafeVerb = mk({
      id: 'p-vague',
      text: 'Responsible for various engineering tasks.',
      evidenceStrength: 'partial',
      extracted: { tools: ['Node.js'], metrics: null } as any,
    });
    const strongKeeps = mk({
      id: 's-keep',
      text: 'Owned enterprise-wide strategy and reduced costs.',
      evidenceStrength: 'strong',
      extracted: { tools: ['Node.js'], metrics: ['20%'] } as any,
    });

    expect(constrainInterpretedEvidenceTextForGeneration(partialOk)).toMatch(/Built/i);
    expect(constrainInterpretedEvidenceTextForGeneration(partialForbidden)).toBeNull();
    expect(constrainInterpretedEvidenceTextForGeneration(partialNoSafeVerb)).toBeNull();
    expect(constrainInterpretedEvidenceTextForGeneration(strongKeeps)).toMatch(/Owned/i);
  });

  it('applies the same constrained wording when building resume sections and cover-letter blocks', () => {
    const eligible: EvidenceItem[] = [
      mk({
        id: 'p-ok',
        text: 'Built and maintained backend services using Node.js.',
        evidenceStrength: 'partial',
        extracted: { tools: ['Node.js'], metrics: null } as any,
      }),
      mk({
        id: 'p-bad',
        text: 'Owned enterprise-wide strategy and reduced costs.',
        evidenceStrength: 'partial',
        extracted: { tools: ['Node.js'], metrics: null } as any,
      }),
    ];
    const sections = buildSyntheticBaselineSectionsFromInterpretedEvidence({
      eligibleEvidence: eligible,
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      sectionType: BaselineSectionType.SUMMARY,
      baseOrder: 10_000,
    }) as any[];
    const blocks = buildSyntheticAllowedBlocksFromInterpretedEvidence({
      eligibleEvidence: eligible,
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      sectionType: BaselineSectionType.SUMMARY,
      baseOrder: 1000,
    });
    expect(sections.map((s) => s.id)).toEqual(['interpreted:p-ok']);
    expect(blocks.map((b) => b.id)).toEqual(['interpreted:p-ok']);
  });

  it('ensures partial evidence cannot invent metrics: constrained helper never adds numbers', () => {
    const partial = mk({
      id: 'p-metricless',
      text: 'Built and maintained backend services using Node.js.',
      evidenceStrength: 'partial',
      extracted: { tools: ['Node.js'], metrics: null } as any,
    });
    const constrained = constrainInterpretedEvidenceTextForGeneration(partial);
    expect(constrained).toBeTruthy();
    expect(String(constrained)).not.toMatch(/\b\d+%/);
    expect(String(constrained)).not.toMatch(/\b\d+x\b/i);
  });

  it('produces consistent evidenceDetailsMap fields for both artifacts', () => {
    const item = mk({
      id: 'evidence:baseline:version:0',
      text: 'Built and maintained services using Node.js.',
      evidenceStrength: 'partial',
      extracted: { tools: ['Node.js'], metrics: null } as any,
    });
    const interpretedByGeneratedEvidenceId = new Map<string, EvidenceItem>([
      ['interpreted:evidence:baseline:version:0:evidence:0', item],
    ]);
    const evidenceDetailsMap = buildEvidenceDetailsMapFromTraceMap({
      traceMap: { opening: ['interpreted:evidence:baseline:version:0:evidence:0'] },
      interpretedEvidenceByGeneratedEvidenceId: interpretedByGeneratedEvidenceId,
    });
    expect(evidenceDetailsMap).toEqual({
      opening: [
        expect.objectContaining({
          evidenceItemId: item.id,
          evidenceStrength: item.evidenceStrength,
          evidenceSource: item.evidenceSource,
          supportLevel: item.supportLevel,
          generationUse: item.generationUse,
          constraintsApplied: expect.any(Array),
          missingElements: expect.any(Array),
        }),
      ],
    });
  });
});
