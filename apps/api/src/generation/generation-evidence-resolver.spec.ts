import { resolveGenerationEvidence } from './generation-evidence-resolver';

describe('resolveGenerationEvidence', () => {
  const baselineBase: any = {
    id: 'baseline-1',
    userId: 'user-1',
    sections: [
      {
        id: 's1',
        title: 'Experience',
        sectionType: 'EXPERIENCE',
        content: ['Acme | Support Lead | 2020 - 2024', '- Led support operations.'].join('\n'),
      },
    ],
    parsedRecords: [],
  };

  it('prefers valid persisted Resume V2 experience when present', () => {
    const baseline: any = {
      ...baselineBase,
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: {
            heading: { name: 'Alex Candidate', contactLine: 'Test City' },
            summary: 'Support leader.',
            experience: [
              { company: 'Acme', roleTitle: 'Support Lead', bullets: ['Led support ops.'] },
            ],
            education: [],
          },
        },
      ],
    };

    const bundle = resolveGenerationEvidence({ baseline, baselineVersionId: 'baseline-version-1' });
    expect(bundle.primarySource).toBe('resume_v2');
    expect(bundle.usableWorkHistoryEvidence).toBe(true);
    expect(bundle.workHistory[0]).toEqual(
      expect.objectContaining({
        company: 'Acme',
        roleTitle: 'Support Lead',
        source: 'resume_v2',
      }),
    );
    expect(bundle.generationAuthority).toBe('baseline_file');
    expect(bundle.workHistory[0]?.provenance?.baselineId).toBe('baseline-1');
  });

  it('falls back to structured baseline sections when Resume V2 is missing/invalid', () => {
    const baseline: any = {
      ...baselineBase,
      parsedRecords: [
        {
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          resumeV2Json: { heading: { name: '' }, experience: [{ company: '', roleTitle: '', bullets: [] }] },
        },
      ],
    };

    const bundle = resolveGenerationEvidence({ baseline, baselineVersionId: 'baseline-version-1' });
    expect(bundle.primarySource).toBe('baseline_sections_structured');
    expect(bundle.usableWorkHistoryEvidence).toBe(true);
    expect(bundle.generationAuthority).toBe('baseline_file');
    expect(bundle.baselineFileUsable).toBe(true);
    expect(bundle.workHistory[0]).toEqual(
      expect.objectContaining({
        company: 'Acme',
        roleTitle: 'Support Lead',
        source: 'baseline_sections_structured',
      }),
    );
    expect(bundle.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['resume_v2_invalid']));
  });

  it('returns usableWorkHistoryEvidence=false when no work history can be derived', () => {
    const baseline: any = {
      ...baselineBase,
      sections: [{ id: 's1', title: 'Skills', sectionType: 'SKILLS', content: 'Python, Snowflake' }],
      parsedRecords: [],
    };

    const bundle = resolveGenerationEvidence({ baseline, baselineVersionId: 'baseline-version-1' });
    expect(bundle.usableWorkHistoryEvidence).toBe(false);
    expect(bundle.workHistory).toEqual([]);
    expect(['baseline_raw_text', 'fit_analysis']).toContain(bundle.primarySource);
  });
});
