import { buildAuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import {
  buildCanonicalResumeDocument,
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
    const docx = mapNormalizedResumeToDocxModel(canonicalResume);
    const plain = buildResumePlainText(canonicalResume);

    expect(docx.sections.map((section) => section.key)).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
    ]);
    expect(plain.indexOf('Summary')).toBeLessThan(plain.indexOf('Core Competencies'));
    expect(plain.indexOf('Core Competencies')).toBeLessThan(plain.indexOf('Professional Experience'));
    expect(plain.indexOf('Professional Experience')).toBeLessThan(plain.indexOf('Education'));
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
});
