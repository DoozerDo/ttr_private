import { ResumeService } from './resume.service';

describe('resume job-aligned presentation authority', () => {
  it('does not add targeting semantics when job keywords are missing', () => {
    const apply = (ResumeService as any).prototype.applyJobAlignedPresentation as (payload: any) => any[];

    const sections = [
      {
        id: 'exp-1',
        type: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        source: 'baseline',
        content: 'Incident Management\n- Owned incident response.\n- Ran postmortems.',
        bullets: [
          {
            id: 'b1',
            text: 'Owned incident response and ran postmortems.',
            source: { baselineSectionId: 'exp-1', bulletIndex: 0, anchorText: 'Owned incident response.' },
          },
        ],
      },
    ];

    const next = apply.call({}, { sections, jobText: null, jobTitle: 'Billing Operations Manager' });

    const summary = next.find((s) => String(s.type).toUpperCase() === 'SUMMARY');
    expect(summary).toBeUndefined();
    expect(JSON.stringify(next)).not.toContain('Targeting');
  });
});

