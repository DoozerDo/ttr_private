import { buildAuthoritativeResumeDraftFromResumeV2 } from './resumeTemplateAssembler';
import { buildAuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';

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
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: null,
        orderedFallbackRoleIds: ['resume_v2_exp_2', 'resume_v2_exp_1', 'resume_v2_exp_0'],
        suppressedFallbackRoleIds: ['resume_v2_exp_0', 'resume_v2_exp_1'],
        allowedEvidenceSnippetIds: null,
      }),
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
  });

  it('renders exclusively from positioningPlan.emphasizeRoleIds (exact order) and never renders suppressed roles', () => {
    const resumeV2 = {
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      summary: 'Old summary.',
      experience: [
        {
          company: 'Vue 3), deck builder frontend',
          roleTitle: 'Contractor',
          dateRange: '2022 - 2023',
          bullets: ['Built UI components.'],
        },
        {
          company: 'Acme Corp',
          roleTitle: 'Customer Operations Manager',
          dateRange: '2020 - 2022',
          bullets: ['Owned escalation workflow and incident triage.', 'Improved SLA adherence through routing and playbooks.'],
        },
        {
          company: 'Beta Systems',
          roleTitle: 'Support Operations Lead',
          dateRange: '2022 - 2024',
          bullets: ['Led incident triage and queue management.', 'Built operating reviews and playbooks for stakeholders.'],
        },
      ],
    } as any;

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2,
      identity: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: {
        emphasizeRoleIds: ['resume_v2_exp_2', 'resume_v2_exp_1'],
        suppressRoleIds: ['resume_v2_exp_0'],
        positioningThesis: 'Experienced support operations leader focused on escalation management and operational process improvement.',
        summaryStrategy: 'operations_first',
        topEvidenceThemes: ['escalation management', 'operational process improvement'],
        } as any,
        orderedFallbackRoleIds: ['resume_v2_exp_0', 'resume_v2_exp_1', 'resume_v2_exp_2'],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
    } as any);

    const companies = (draft.experience ?? []).map((e: any) => String(e?.company ?? ''));
    expect(companies).toEqual(['Beta Systems', 'Acme Corp']);
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('Vue 3), deck builder frontend');
    expect(String(draft.summary ?? '')).toMatch(/support operations|operations leader|escalation/i);
  });

  it('prefers canonical structured baseline experience identity over malformed ResumeV2 parser-derived headers when available', () => {
    const resumeV2 = {
      heading: { name: 'Prod Person', contactLine: 'prod@example.com' },
      summary: 'Old summary.',
      experience: [
        {
          // Malformed identity coming from parser-derived fields.
          company: 'Seattle',
          roleTitle: 'Senior Manager, Customer Operations – SentinelOne',
          dateRange: 'Dec 2018 – Oct 2019',
          bullets: ['Owned incident operations and escalation handling.'],
        },
        {
          company: 'iStreamPlanet',
          roleTitle: 'Director, Customer Success',
          dateRange: 'United States 2006 – 2013',
          bullets: ['Led customer success programs.'],
        },
      ],
    } as any;

    const structuredBaselineForIdentity = {
      experience: [
        {
          company: 'SentinelOne',
          roleTitle: 'Senior Manager, Customer Operations',
          dates: 'Remote Dec 2022 – Aug 2025',
          bullets: ['Owned incident operations and escalation handling.'],
        },
        {
          company: 'iStreamPlanet (Warner Bros. Discovery)',
          roleTitle: 'Director, Customer Success',
          dates: 'United States 2006 – 2013',
          bullets: ['Led customer success programs.'],
        },
      ],
    } as any;

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2,
      identity: { name: 'Prod Person', contactLine: 'prod@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: null,
        orderedFallbackRoleIds: [],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
      structuredBaselineForIdentity,
    });

    const top = (draft.experience ?? [])[0] as any;
    expect(String(top.company)).toBe('SentinelOne');
    expect(String(top.roleTitle)).toBe('Senior Manager, Customer Operations');
    expect(String(top.dateRange ?? '')).toMatch(/Dec 2022/i);
    // Explicit cross-role date contamination guard: SentinelOne must not inherit iStreamPlanet's date range.
    expect(String(top.dateRange ?? '')).not.toMatch(/2006/i);
    expect(String(top.dateRange ?? '')).not.toMatch(/2013/i);
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('"Seattle"');

    const iStream = (draft.experience ?? []).find((e: any) => String(e?.company ?? '').includes('iStreamPlanet')) as any;
    expect(String(iStream?.dateRange ?? '')).toMatch(/2006/i);
    expect(String(iStream?.dateRange ?? '')).toMatch(/2013/i);
  });
});
