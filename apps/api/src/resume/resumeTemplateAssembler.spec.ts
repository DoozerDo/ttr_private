import { buildAuthoritativeResumeDraftFromResumeV2 } from './resumeTemplateAssembler';

describe('buildAuthoritativeResumeDraftFromResumeV2', () => {
  it('ignores ResumeV2 ordering and excludes weak fragment roles when stronger evidence exists', () => {
    const resumeV2 = {
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      summary: '',
      experience: [
        {
          company: 'Vue 3), deck builder frontend',
          roleTitle: 'Contractor',
          dateRange: '2022 - 2023',
          bullets: ['Built UI components.'],
        },
        {
          company: 'AMS DataSerfs',
          roleTitle: 'Linux System Administrator (Contractor)',
          dateRange: '2022 - 2024',
          bullets: ['Administered Linux infrastructure.'],
        },
        {
          company: 'Acme',
          roleTitle: 'Director of Support',
          dateRange: '2020 - 2024',
          bullets: [
            'Led support operations and improved incident response quality through repeatable playbooks',
            'Partnered cross-functionally to reduce escalation friction and improve stakeholder updates',
          ],
        },
      ],
    } as any;

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2,
      identity: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      rankedExperienceIds: ['resume_v2_exp_2', 'resume_v2_exp_1', 'resume_v2_exp_0'],
      suppressedExperienceIds: ['resume_v2_exp_0', 'resume_v2_exp_1'],
      professionalIdentity: 'Support Operations / Customer Operations leader',
      targetNarrative: 'Operational leadership focused on scalable support systems, cross-functional execution, and escalation/root-cause rhythms.',
    });

    const companies = (draft.experience ?? []).map((e: any) => String(e?.company ?? ''));
    expect(companies[0]).toBe('Acme');
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('Vue 3), deck builder frontend');
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('AMS DataSerfs');

    const sentenceCount = String(draft.summary ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).length;
    expect(sentenceCount).toBeGreaterThanOrEqual(2);

    const firstBullets = (draft.experience?.[0] as any)?.bullets ?? [];
    expect(firstBullets.length).toBeGreaterThanOrEqual(2);
    const totalBullets = (draft.experience ?? []).flatMap((e: any) => e?.bullets ?? []).length;
    expect(totalBullets).toBeGreaterThanOrEqual(3);
  });
});

