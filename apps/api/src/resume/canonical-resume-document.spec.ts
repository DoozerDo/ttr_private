import { buildAuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import {
  buildCanonicalResumeDocument,
  buildCanonicalResumePresentationPlan,
  buildResumePlainText,
  mapNormalizedResumeToDocxModel,
  normalizeNormalizedResumeDocument,
} from './resume-normalization';
import { assembleResumeFromStructuredBaseline, buildAuthoritativeResumeDraftFromResumeV2 } from './resumeTemplateAssembler';

describe('canonical resume document', () => {
  const canonicalResume = normalizeNormalizedResumeDocument({
    heading: {
      name: 'Alex Candidate',
      contactLine: 'alex@example.com',
    },
    summary:
      'Experienced operations leader with a strong background in escalation management and process improvement.',
    competencies: ['Process improvement', 'Escalation management'],
    coreCompetencies: ['Process improvement', 'Escalation management'],
    experience: [
      {
        company: 'Acme Corp',
        roleTitle: 'Support Operations Lead',
        dateRange: '2020 - 2024',
        bullets: [
          'Led incident response and playbooks across support operations.',
          'Improved SLA reporting and routing clarity for cross-functional teams.',
        ],
      },
    ],
    education: [
      {
        institution: 'State University',
        degree: 'B.S. Business',
        location: 'Seattle, WA',
      },
    ],
  } as any);

  it('builds one canonical resume document model with a fixed section order', () => {
    const canonical = buildCanonicalResumeDocument(canonicalResume);

    expect(canonical.sectionOrder).toEqual([
      'summary',
      'impact',
      'competencies',
      'experience',
      'education',
      'certifications',
      'technical_skills',
    ]);
    expect(canonical.technicalSkills).toEqual(['Process improvement', 'Escalation management']);
    expect(canonical.impact).toContain('Led incident response');
  });

  it('feeds the same section order into DOCX and plain-text renderers', () => {
    const plan = buildCanonicalResumePresentationPlan(canonicalResume);
    const docx = mapNormalizedResumeToDocxModel(canonicalResume);
    const plain = buildResumePlainText(canonicalResume);

    expect(plan.templateVersion).toBe('canonical_resume_v1');
    expect(plan.sectionOrder).toEqual([
      'summary',
      'impact',
      'competencies',
      'experience',
      'education',
      'certifications',
      'technical_skills',
    ]);
    expect(docx.sections.map((section) => section.key)).toEqual([
      'summary',
      'impact',
      'competencies',
      'experience',
      'education',
      'technical_skills',
    ]);
    expect(plain.indexOf('Executive Summary')).toBeLessThan(plain.indexOf('Core Competencies'));
    expect(plain.indexOf('Core Competencies')).toBeLessThan(plain.indexOf('Professional Experience'));
    expect(plain.indexOf('Professional Experience')).toBeLessThan(plain.indexOf('Education'));
    if (plan.certifications.length) {
      expect(plain.indexOf('Education')).toBeLessThan(plain.indexOf('Certifications'));
      expect(plain.indexOf('Certifications')).toBeLessThan(plain.indexOf('Technical Skills'));
    }
  });

  it('attaches the canonical document wrapper at the resume composition boundary', () => {
    const structuredBaseline = {
      experience: [
        {
          company: 'Acme Corp',
          roleTitle: 'Support Operations Lead',
          dates: '2020 - 2024',
          bullets: [
            'Led incident response and playbooks across support operations.',
            'Improved SLA reporting and routing clarity for cross-functional teams.',
          ],
        },
      ],
      skills: ['Process improvement', 'Escalation management'],
      education: [],
    } as any;

    const assembled = assembleResumeFromStructuredBaseline(structuredBaseline, {
      name: 'Alex Candidate',
      contactLine: 'alex@example.com',
    });
    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2: assembled,
      identity: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: null,
        orderedFallbackRoleIds: [],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
    });

    expect((draft as any).sectionOrder).toEqual([
      'summary',
      'impact',
      'competencies',
      'experience',
      'education',
      'certifications',
      'technical_skills',
    ]);
    expect((draft as any).__compositionDiagnostics?.canonicalSectionOrder).toEqual([
      'summary',
      'impact',
      'competencies',
      'experience',
      'education',
      'certifications',
      'technical_skills',
    ]);
  });

  it('upgrades a thin composition summary into a grounded multi-sentence canonical summary before rendering', () => {
    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2: {
        heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
        summary: 'Support operations leader.',
        experience: [
          {
            company: 'Acme Corp',
            roleTitle: 'Support Operations Lead',
            dateRange: '2020 - 2024',
            bullets: [
              'Led incident response and playbooks across support operations.',
              'Improved SLA reporting and routing clarity for cross-functional teams.',
            ],
          },
        ],
        education: [],
      } as any,
      identity: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: {
          summaryStrategy: 'operations_first',
          topEvidenceThemes: ['incident response', 'process improvement'],
        } as any,
        orderedFallbackRoleIds: [],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
    } as any);

    const summarySentences = String((draft as any).summary ?? '')
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);

    expect(summarySentences.length).toBeGreaterThanOrEqual(2);
    expect(String((draft as any).summary ?? '')).toContain('Support Operations Lead');
    expect(String((draft as any).summary ?? '')).toContain('Acme Corp');
  });

  it('keeps only correctly classified production-quality content inside the canonical document', () => {
    const productionShapedResume = normalizeNormalizedResumeDocument({
      heading: {
        name: 'Alex Candidate',
        contactLine: 'alex@example.com | (703) 850-7289 | linkedin.com/in/alex-candidate',
      },
      summary:
        'Executive operations leader with a track record of improving escalation handling, reporting cadence, and customer-facing execution.',
      competencies: ['Incident management', 'Process improvement', 'Reporting'],
      coreCompetencies: ['Incident management', 'Process improvement', 'Reporting'],
      experience: [
        {
          company: 'SentinelOne',
          roleTitle: 'Senior Manager, Customer Operations',
          dateRange: 'Dec 2022 - Aug 2025',
          bullets: [
            'Owned incident operations and escalation handling for customer operations.',
            'Improved reporting cadence and playbooks across the operating rhythm.',
          ],
        },
        {
          company: 'Starbucks',
          roleTitle: 'Senior Manager, Technology Operations Excellence',
          dateRange: 'Apr 2020 - Mar 2022',
          bullets: [
            'Directed technology operations excellence across enterprise locations.',
            'Built SLA dashboards and automation models for decision making.',
          ],
        },
        {
          company: 'ITIL Foundation',
          roleTitle: 'Certification',
          dateRange: '2024',
          bullets: ['ITIL Foundation certification.'],
        },
        {
          company: 'Lean Six Sigma',
          roleTitle: 'Green Belt',
          dateRange: '2023',
          bullets: ['Lean Six Sigma Green Belt certification.'],
        },
        {
          company: 'TECHNOLOGY',
          roleTitle: 'TECHNOLOGY',
          dateRange: '',
          bullets: ['TECHNOLOGY', 'and and', 'Customer support., operations'],
        },
      ],
      additionalSections: [
        {
          title: 'Certifications',
          items: [
            'ITIL Foundation | Axelos | 2024',
            'Lean Six Sigma Green Belt | 2023',
          ],
        },
      ],
    } as any);

    const canonical = buildCanonicalResumeDocument(productionShapedResume);
    const experienceCompanies = canonical.experience.map((entry) => entry.company);
    const bullets = canonical.experience.flatMap((entry) => entry.bullets);
    const certifications = canonical.additionalSections?.find((section) =>
      /certifications?/i.test(section.title),
    )?.items ?? [];

    expect(experienceCompanies).toEqual(['SentinelOne', 'Starbucks']);
    expect(canonical.experience.every((entry) => !/itil|lean six sigma|technology/i.test(entry.company))).toBe(true);
    expect(canonical.experience.every((entry) => !/itil|lean six sigma/i.test(entry.roleTitle))).toBe(true);
    expect(canonical.experience.every((entry) => String(entry.roleTitle ?? '').trim().toUpperCase() !== 'TECHNOLOGY')).toBe(true);
    expect(bullets.some((bullet) => /and and|\.,/i.test(bullet))).toBe(false);
    expect(bullets.some((bullet) => String(bullet ?? '').trim().toUpperCase() === 'TECHNOLOGY')).toBe(false);
    expect(bullets.every((bullet) => bullet.trim().length > 20)).toBe(true);
    expect(canonical.heading.contactLine).toContain('alex@example.com');
    expect(canonical.heading.contactLine).toContain('(703) 850-7289');
    expect(canonical.heading.contactLine).toContain('linkedin.com/in/alex-candidate');
    expect(String(canonical.summary ?? '')).toContain('Executive operations leader');
    expect(canonical.sectionOrder).toEqual([
      'summary',
      'impact',
      'competencies',
      'experience',
      'education',
      'certifications',
      'technical_skills',
    ]);
    expect(certifications.join(' | ')).toContain('ITIL Foundation');
    expect(certifications.join(' | ')).toContain('Lean Six Sigma');
    expect(canonical.technicalSkills).toEqual(['Incident management', 'Process improvement', 'Reporting']);
    expect(JSON.stringify(canonical)).not.toContain('TECHNOLOGY');
    expect(JSON.stringify(canonical)).not.toContain('and and');
    expect(JSON.stringify(canonical)).not.toContain('.,');
    expect(JSON.stringify(canonical.experience)).not.toContain('ITIL Foundation');
    expect(JSON.stringify(canonical.experience)).not.toContain('Lean Six Sigma');
  });
});
