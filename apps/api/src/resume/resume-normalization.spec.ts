import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { BaselineSectionType } from '../baseline/baseline-section.entity';
import { getDocxTemplate } from '../docx-templates/docx-template.registry';
import type { ResumeDocxModel } from '../docx-templates/docx-template.types';
import '../docx-templates/templates';
import {
  buildNormalizedResumeDocument,
  mapNormalizedResumeToDocxModel,
  buildResumePlainText,
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from './resume-normalization';

async function renderDocumentXml(model: ResumeDocxModel): Promise<string> {
  const template = getDocxTemplate<ResumeDocxModel>('resume', 'classic_professional_v1');
  const result = await template.render(model, { templateKey: 'classic_professional_v1' });
  const zip = await JSZip.loadAsync(result.buffer);
  return zip.file('word/document.xml')!.async('text');
}

function extractParagraphXml(documentXml: string): string[] {
  return documentXml.match(/<w:p>[\s\S]*?<\/w:p>/g) ?? [];
}

describe('resume-normalization', () => {
  it('parses company | role | date headers without losing the role title', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Northstar Cloud | Senior Product Operations Manager | 2021 - Present',
          '- Built onboarding experiments that increased activation by 21 percent.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.company).toBe('Northstar Cloud');
    expect(document.experience[0]?.roleTitle).toBe('Senior Product Operations Manager');
    expect(document.experience[0]?.dateRange).toBe('2021 - Present');
  });

  it('does not crash on incomplete pipe headers', () => {
    expect(() =>
      buildNormalizedResumeDocument([
        {
          type: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: ['Northstar Cloud |', '- Led enterprise escalations.'].join('\n'),
        },
      ] as any),
    ).not.toThrow();
  });

  it('parses two-part pipe experience headers as company | role when role is clearly a role title', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'PMB Performance | Service Delivery Manager (2024–Present)',
          '- Led incident triage and improved operational outcomes.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.company).toBe('PMB Performance');
    expect(String(document.experience[0]?.roleTitle ?? '')).toMatch(/Service Delivery Manager/i);
  });

  it('keeps bullets attached to the correct experience role', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Director, Support Operations | Alpha Co | 2022 - Present',
          '- Led enterprise escalations.',
          '',
          'Support Manager | Beta Co | 2019 - 2022',
          '- Managed queue performance.',
        ].join('\n'),
        bullets: [
          { text: 'Led enterprise escalations.', source: { experienceEntryIndex: 0 } },
          { text: 'Managed queue performance.', source: { experienceEntryIndex: 1 } },
        ] as any,
      },
    ] as any);

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0]?.company).toBe('Alpha Co');
    expect(document.experience[0]?.bullets).toEqual(['Led enterprise escalations.']);
    expect(document.experience[1]?.company).toBe('Beta Co');
    expect(document.experience[1]?.bullets).toEqual(['Managed queue performance.']);
  });

  it('does not emit pagination artifacts in plain text export', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Page 1',
          'Support Manager | Acme | 2021 - 2024',
          '- Improved incident triage.',
          '1 / 3',
        ].join('\n'),
      },
    ] as any);

    const plain = buildResumePlainText(document);
    expect(plain).toContain('Improved incident triage.');
    expect(plain).not.toContain('Page 1');
    expect(plain).not.toContain('1 / 3');
  });

  it('deduplicates repeated education entries', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EDUCATION,
        title: 'Education',
        content: [
          'B.S. Computer Science | University of Example | Seattle, WA',
          'B.S. Computer Science | University of Example | Seattle, WA',
        ].join('\n'),
      },
    ] as any);

    expect(document.education).toHaveLength(1);
  });

  it('renders experience headers as company and role/date blocks with separator spacing in plain text export', () => {
    const plain = buildResumePlainText({
      heading: {
        name: 'Alex Candidate',
        contactLine: 'alex@example.com | (703) 850-7289',
      },
      experience: [
        {
          company: 'Cat Daddy Games',
          roleTitle: 'Senior Producer',
          location: 'Kirkland, WA',
          dateRange: '2020 - 2025',
          bullets: ['Led live operations roadmap delivery across multiple game releases.'],
        },
        {
          company: 'MobilityWare',
          roleTitle: 'Producer',
          location: 'Irvine, CA',
          dateRange: '2018 - 2020',
          bullets: ['Drove roadmap execution for multiple mobile titles.'],
        },
      ],
      education: [],
      competencies: [],
      coreCompetencies: [],
      additionalSections: [],
    });

    expect(plain).toContain('Cat Daddy Games | Kirkland, WA');
    expect(plain).toContain('Senior Producer | 2020 - 2025');
    expect(plain).toContain('MobilityWare | Irvine, CA');
    expect(plain).toContain('Producer | 2018 - 2020');
    expect(plain).toMatch(
      /- Led live operations roadmap delivery across multiple game releases\.\n\nMobilityWare \| Irvine, CA/,
    );
  });

  it('deduplicates merged education tokens and duplicate rows at plain text render boundary', () => {
    const plain = buildResumePlainText({
      heading: {
        name: 'Alex Candidate',
        contactLine: 'alex@example.com | (703) 850-7289',
      },
      experience: [],
      education: [
        {
          degree:
            'Master of Science in Interactive Entertainment Design & Production | Master of Science in Interactive Entertainment Design & Production',
          institution:
            'University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
        },
        {
          degree: 'Master of Science in Interactive Entertainment Design & Production',
          institution: 'University of Central Florida, Orlando, FL',
        },
        {
          degree:
            'Bachelor of Arts in Art & Visual Technology | Bachelor of Arts in Art & Visual Technology',
          institution:
            'George Mason University, Fairfax, VA | George Mason University, Fairfax, VA',
        },
        {
          degree: 'MBA | MBA.',
          institution: 'MBA | University of Washington | University of Washington,',
          location: 'University of Washington.',
        },
      ],
      competencies: [],
      coreCompetencies: [],
      additionalSections: [],
    });

    const msMatches =
      plain.match(/Master of Science in Interactive Entertainment Design & Production/g) ?? [];
    const baMatches = plain.match(/Bachelor of Arts in Art & Visual Technology/g) ?? [];
    const ucfMatches = plain.match(/University of Central Florida, Orlando, FL/g) ?? [];
    const gmuMatches = plain.match(/George Mason University, Fairfax, VA/g) ?? [];
    const mbaMatches = plain.match(/\bMBA\b/g) ?? [];
    const uwMatches = plain.match(/University of Washington/g) ?? [];

    expect(msMatches).toHaveLength(1);
    expect(baMatches).toHaveLength(1);
    expect(ucfMatches).toHaveLength(1);
    expect(gmuMatches).toHaveLength(1);
    expect(mbaMatches).toHaveLength(1);
    expect(uwMatches).toHaveLength(1);
    expect(plain).not.toContain('MBA | MBA');
    expect(plain).not.toContain('University of Washington | University of Washington');
  });

  it('removes incomplete trailing bullet fragments before rendering', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Launched signature interactive features including SuperStar Spinner, Alt. Positions, Courtside Pass, and',
          '- Owned live-ops planning and release execution for seasonal events.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.bullets).toEqual([
      'Owned live-ops planning and release execution for seasonal events.',
    ]);
  });

  it('formats contact line for known phone and email', () => {
    const document = buildNormalizedResumeDocument(
      [
        {
          type: BaselineSectionType.RAW,
          title: 'Header',
          content: ['Jane Candidate', 'jane@example.com', '703) 850-7289'].join('\n'),
        },
      ] as any,
      { fullName: 'Jane Candidate', location: 'Seattle, WA' } as any,
    );

    expect(document.heading.contactLine).toContain('jane@example.com');
    expect(document.heading.contactLine).toContain('(703) 850-7289');
  });

  it('deduplicates duplicate phone tokens in heading contact line', () => {
    const document = buildNormalizedResumeDocument(
      [
        {
          type: BaselineSectionType.RAW,
          title: 'Header',
          content: ['Alex Candidate', 'alex@example.com', '(703) 850-7289'].join('\n'),
        },
      ] as any,
      {
        fullName: 'Alex Candidate',
        location: 'Kirkland, WA | 703-850-7289',
      } as any,
    );

    expect(document.heading.contactLine).toContain('alex@example.com');
    const phoneMatches = document.heading.contactLine.match(/\(703\)\s850-7289/g) ?? [];
    expect(phoneMatches).toHaveLength(1);
  });

  it('normalizes problematic gaming resume fragments into clean grouped output', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.RAW,
        title: 'Header',
        content: ['Alex Candidate', 'alex@example.com', '703) 850-7289'].join('\n'),
      },
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Page 1 3',
          'Cat Daddy | Kirkland, WA | 2021 - Present',
          'Senior Producer | 2K',
          '- Led live operations roadmap delivery across multiple game releases.',
          '- Led live operations roadmap delivery across multiple game releases.',
          'Company',
          'systems',
          'mathematical',
          'deployment timelines',
          'Page 2 3',
        ].join('\n'),
        bullets: [
          {
            text: 'Led live operations roadmap delivery across multiple game releases.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Led live operations roadmap delivery across multiple game releases.',
            source: { experienceEntryIndex: 0 },
          },
        ] as any,
      },
      {
        type: BaselineSectionType.EDUCATION,
        title: 'Education',
        content: [
          'B.A. Media Arts | University of Washington | Seattle, WA',
          'B.A. Media Arts | University of Washington | Seattle, WA',
        ].join('\n'),
      },
    ] as any);

    expect(document.heading.contactLine).toContain('(703) 850-7289');
    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.company).toBe('Cat Daddy');
    expect(document.experience[0]?.roleTitle).toBe('Senior Producer');
    expect(document.experience[0]?.bullets).toEqual([
      'Led live operations roadmap delivery across multiple game releases.',
    ]);
    expect(document.education).toHaveLength(1);

    const plain = buildResumePlainText(document);
    expect(plain).not.toContain('Page 1 3');
    expect(plain).not.toContain('Page 2 3');
    expect(plain).not.toContain('\nCompany\n');
    expect(plain).not.toContain('\nsystems\n');
    expect(plain).not.toContain('\nmathematical\n');
    expect(plain).not.toContain('\ndeployment timelines\n');
  });

  it('does not promote section labels or tech fragments into company headers during normalization', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Infrastructure & Deployment',
          '- Owned incident response and improved reliability across systems.',
          '',
          'Vue 3), deck builder frontend',
          '- Shipped customer-facing features and improved performance.',
        ].join('\n'),
      },
    ] as any);

    const companies = document.experience.map((entry) => entry.company);
    expect(companies).not.toContain('Infrastructure & Deployment');
    expect(companies).not.toContain('Vue 3), deck builder frontend');
  });

  it('does not promote pipe fragments without credible dates into experience headers', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Vue 3), deck builder frontend | Project',
          '- Built UI components.',
          '',
          'Automation & Monitoring | Responsibilities',
          '- Improved alert quality.',
          '',
          'Datacenter Operations | Responsibilities',
          '- Reduced downtime.',
          '',
          'Internal Web Applications | Responsibilities',
          '- Shipped features.',
        ].join('\n'),
      },
    ] as any);

    const companies = document.experience.map((entry) => entry.company);
    expect(companies).not.toContain('Vue 3), deck builder frontend');
    expect(companies).not.toContain('Automation & Monitoring');
    expect(companies).not.toContain('Datacenter Operations');
    expect(companies).not.toContain('Internal Web Applications');
  });

  it('does not assign malformed raw lines directly to company during normalization', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Project',
          'Vue 3), deck builder frontend',
          '2024 - 2025',
          '- Built UI components.',
          '',
          'Of Fates Games LLC',
          'Senior Developer',
          '2021 - 2024',
          '- Built backend services.',
          '',
          'Automation & Monitoring',
          '2019 - 2020',
          '- Improved alert quality.',
          '',
          'AMS DataSerfs, Inc.',
          'Linux System Administrator',
          'July 2024 - April 2026',
          '- Maintained systems.',
          '',
          'Datacenter Operations',
          '2018 - 2019',
          '- Reduced downtime.',
          '',
          'Internal Web Applications',
          '2017 - 2018',
          '- Shipped features.',
          '',
          'Biblioso',
          'Staff Program Manager',
          '2016 - 2017',
          '- Managed programs.',
          '',
          'Wowrack',
          'Platform Engineer',
          '2014 - 2016',
          '- Automated workflows.',
          '',
          'OfficeMax / OfficeDepot',
          'Operations Manager',
          '2012 - 2014',
          '- Managed store operations.',
        ].join('\n'),
      },
    ] as any);

    const companies = document.experience.map((entry) => entry.company);
    expect(companies).toContain('Of Fates Games LLC');
    expect(companies).toContain('AMS DataSerfs, Inc.');
    expect(companies).toContain('Biblioso');
    expect(companies).toContain('Wowrack');
    expect(companies).toContain('OfficeMax / OfficeDepot');
    expect(companies).not.toContain('Vue 3), deck builder frontend');
    expect(companies).not.toContain('Automation & Monitoring');
    expect(companies).not.toContain('Datacenter Operations');
    expect(companies).not.toContain('Internal Web Applications');
  });

  it('accepts pipe headers only when a credible date exists inline or adjacent', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'AMS DataSerfs, Inc. | Linux System Administrator',
          'July 2024 - April 2026',
          '- Maintained systems.',
          '',
          'Of Fates Games LLC | Contractor | August 2024 - Present',
          '- Built features.',
        ].join('\n'),
      },
    ] as any);

    const companies = document.experience.map((entry) => entry.company);
    expect(companies).toContain('AMS DataSerfs, Inc.');
    expect(companies).toContain('Of Fates Games LLC');
  });

  it('does not fall back missing role titles to \"Professional Experience\"', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          // Company + date line, but no parseable role title line.
          'Example Co | Seattle, WA | 2020 - 2024',
          '- Led support operations across global teams.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience.length).toBeGreaterThan(0);
    expect(document.experience.some((entry) => entry.roleTitle === 'Professional Experience')).toBe(false);
  });

  it('never emits dangling fragment bullets in final plain text (ex: "... The")', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy | Kirkland, WA | 2021 - Present',
          'Senior Producer',
          '- Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game. The',
          '- Led live operations roadmap delivery across multiple game releases.',
        ].join('\n'),
        bullets: [
          {
            text: 'Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game. The',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Led live operations roadmap delivery across multiple game releases.',
            source: { experienceEntryIndex: 0 },
          },
        ] as any,
      },
    ] as any);

    const plain = buildResumePlainText(document);
    expect(plain).not.toContain('game. The');
    expect(plain).toContain('Led live operations roadmap delivery across multiple game releases.');
  });

  it('keeps Cat Daddy Games and MobilityWare as separate coherent role blocks', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2021 - Present',
          'Senior Producer | 2K',
          '- Led live operations roadmap delivery across multiple game releases.',
          '',
          'MobilityWare | Irvine, CA | 2018 - 2021',
          'Producer',
          '- Drove roadmap execution for multiple mobile titles.',
          'Page 1 3',
          'Company',
        ].join('\n'),
        bullets: [
          {
            text: 'Led live operations roadmap delivery across multiple game releases.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Drove roadmap execution for multiple mobile titles.',
            source: { experienceEntryIndex: 1 },
          },
        ] as any,
      },
    ] as any);

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0]).toMatchObject({
      company: 'Cat Daddy Games',
      roleTitle: 'Senior Producer',
      location: 'Kirkland, WA',
    });
    expect(document.experience[1]).toMatchObject({
      company: 'MobilityWare',
      roleTitle: 'Producer',
      location: 'Irvine, CA',
    });
    expect(document.experience[0]?.bullets).toEqual([
      'Led live operations roadmap delivery across multiple game releases.',
    ]);
    expect(document.experience[1]?.bullets).toEqual([
      'Drove roadmap execution for multiple mobile titles.',
    ]);
  });

  it('does not spill unscoped bullets into later roles when multiple role entries exist', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Producer',
          '- Led live operations roadmap delivery across multiple game releases.',
          'MobilityWare | Irvine, CA | 2016 - 2020',
          'Producer',
          '- Drove roadmap execution for multiple mobile titles.',
        ].join('\n'),
        bullets: [
          {
            text: 'Led live operations roadmap delivery across multiple game releases.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Drove roadmap execution for multiple mobile titles.',
            source: { experienceEntryIndex: 1 },
          },
          {
            text: 'Led live operations roadmap delivery across multiple game releases.',
          },
        ] as any,
      },
    ] as any);

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0]?.bullets).toEqual([
      'Led live operations roadmap delivery across multiple game releases.',
    ]);
    expect(document.experience[1]?.bullets).toEqual([
      'Drove roadmap execution for multiple mobile titles.',
    ]);
  });

  it('removes parser spillover bullets from later roles when later role lacks direct source evidence', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Producer',
          '- Managed virtual economy balancing for live events.',
          'PlayStudios | Las Vegas, NV | 2018 - 2020',
          'Producer',
          '- Delivered release planning for social casino titles.',
        ].join('\n'),
        bullets: [
          {
            text: 'Managed virtual economy balancing for live events.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Managed virtual economy balancing for live events.',
            source: { experienceEntryIndex: 1 },
          },
          {
            text: 'Delivered release planning for social casino titles.',
            source: { experienceEntryIndex: 1 },
          },
        ] as any,
      },
    ] as any);

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0]?.bullets).toEqual([
      'Managed virtual economy balancing for live events.',
    ]);
    expect(document.experience[1]?.bullets).toEqual([
      'Delivered release planning for social casino titles.',
    ]);
  });

  it('keeps repeated bullets in later roles when later role explicitly contains them', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Producer',
          '- Led roadmap planning across live game releases.',
          'PlayStudios | Las Vegas, NV | 2018 - 2020',
          'Producer',
          '- Led roadmap planning across live game releases.',
          '- Managed social casino economy tuning.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0]?.bullets).toContain(
      'Led roadmap planning across live game releases.',
    );
    expect(document.experience[1]?.bullets).toContain(
      'Led roadmap planning across live game releases.',
    );
  });

  it('keeps Greg-style multi-role bullets contained to their originating employers', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Built economy tuning systems for seasonal live events.',
          'Monopoly Solitaire | Irvine, CA | 2019 - 2020',
          'Game Designer',
          '- Shipped progression updates for Monopoly Solitaire live content.',
          'PlayStudios | Las Vegas, NV | 2017 - 2019',
          'Game Designer',
          '- Led social casino release planning and content operations.',
          'Max Axe | Remote | 2015 - 2017',
          'Designer',
          '- Implemented gameplay tuning dashboards for early stage titles.',
        ].join('\n'),
        bullets: [
          {
            text: 'Built economy tuning systems for seasonal live events.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Shipped progression updates for Monopoly Solitaire live content.',
            source: { experienceEntryIndex: 1 },
          },
          {
            text: 'Led social casino release planning and content operations.',
            source: { experienceEntryIndex: 2 },
          },
          {
            text: 'Implemented gameplay tuning dashboards for early stage titles.',
            source: { experienceEntryIndex: 3 },
          },
          {
            text: 'Built economy tuning systems for seasonal live events.',
            source: { experienceEntryIndex: 3 },
          },
        ] as any,
      },
      {
        type: BaselineSectionType.EDUCATION,
        title: 'Education',
        content: [
          'B.A. Media Arts | University of Washington | Seattle, WA',
          'B.A. Media Arts | University of Washington | Seattle, WA',
        ].join('\n'),
      },
    ] as any);

    expect(document.education).toHaveLength(1);
    const byCompany = new Map(document.experience.map((entry) => [entry.company, entry.bullets]));
    expect(byCompany.get('Cat Daddy Games')).toEqual([
      'Built economy tuning systems for seasonal live events.',
    ]);
    expect(byCompany.get('Monopoly Solitaire')).toEqual([
      'Shipped progression updates for Monopoly Solitaire live content.',
    ]);
    expect(byCompany.get('PlayStudios')).toEqual([
      'Led social casino release planning and content operations.',
    ]);
    expect(byCompany.get('Max Axe')).toEqual([
      'delivered gameplay tuning dashboards for early stage titles.',
    ]);
  });

  it('removes orphan fragments from the real leaked shape', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Producer | 2K',
          'mathematical',
          'deployment timelines',
          'pricing structures',
          '- Led live operations roadmap delivery across multiple game releases.',
          'Page 1',
          '3',
        ].join('\n'),
        bullets: [
          {
            text: 'Led live operations roadmap delivery across multiple game releases.',
            source: { experienceEntryIndex: 0 },
          },
        ] as any,
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.company).toBe('Cat Daddy Games');
    expect(document.experience[0]?.roleTitle).toBe('Senior Producer');
    expect(document.experience[0]?.bullets).toEqual([
      'Led live operations roadmap delivery across multiple game releases.',
    ]);
    const plain = buildResumePlainText(document);
    expect(plain).not.toContain('\n2K\n');
    expect(plain).not.toContain('\nmathematical\n');
    expect(plain).not.toContain('\ndeployment timelines\n');
    expect(plain).not.toContain('\npricing structures\n');
    expect(plain).not.toContain('Page 1');
  });

  it('omits empty summary and competencies sections after normalization', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.SUMMARY,
        title: 'Summary',
        content: 'Summary',
      },
      {
        type: BaselineSectionType.SKILLS,
        title: 'Core Competencies',
        content: 'Company | systems | mathematical',
      },
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: 'Support Manager | Acme | 2022 - Present\n- Led incident response.',
      },
    ] as any);

    expect(document.summary).toBeUndefined();
    expect(document.coreCompetencies).toBeUndefined();
  });

  it('reconstructs experience when parsed shape is location, company, date, then bullets', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Kirkland, WA',
          'Cat Daddy Games',
          '2020 - 2025',
          '- Led live operations roadmap delivery across multiple game releases.',
          'Page 1 3',
          '2K',
          'mathematical',
          'deployment timelines',
          '',
          'Irvine, CA',
          'MobilityWare',
          '2016 - 2020',
          '- Drove roadmap execution for multiple mobile titles.',
          'Page 2 3',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0]).toMatchObject({
      company: 'Cat Daddy Games',
      location: 'Kirkland, WA',
      dateRange: '2020 - 2025',
      roleTitle: '',
      bullets: ['Led live operations roadmap delivery across multiple game releases.'],
    });
    expect(document.experience[1]).toMatchObject({
      company: 'MobilityWare',
      location: 'Irvine, CA',
      dateRange: '2016 - 2020',
      bullets: ['Drove roadmap execution for multiple mobile titles.'],
    });

    const plain = buildResumePlainText(document);
    expect(plain).not.toContain('Page 1 3');
    expect(plain).not.toContain('Page 2 3');
    expect(plain).not.toContain('\n2K\n');
    expect(plain).not.toContain('\nmathematical\n');
    expect(plain).not.toContain('\ndeployment timelines\n');
  });

  it('accepts normalized experience entries with inferred role titles during validation', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games',
          '2020 - 2025',
          '- Led live operations roadmap delivery across multiple game releases.',
        ].join('\n'),
      },
    ] as any);

    const validation = validateNormalizedResumeDocument(document);
    expect(validation.valid).toBe(true);
    expect(validation.reasons).toEqual([]);
  });

  it('keeps lowercase single-word company entries when baseline bullets are valid', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'producer | playstudios | 2018 - 2020',
          '- Led social casino release planning and content operations.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.company.toLowerCase()).toBe('playstudios');
    expect(document.experience[0]?.bullets).toEqual([
      'Led social casino release planning and content operations.',
    ]);

    const validation = validateNormalizedResumeDocument(document);
    expect(validation.valid).toBe(true);
  });

  it('strips pagination artifacts from final normalized fields before validation', () => {
    const document = buildNormalizedResumeDocument(
      [
        {
          type: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          content: [
            'Cat Daddy Games | Page 1 3 | 2020 - 2025',
            'Senior Producer | Page 2',
            '- Led live operations roadmap delivery across multiple game releases. Page 3',
            '- Improved release quality through test automation and telemetry instrumentation.',
          ].join('\n'),
        },
        {
          type: BaselineSectionType.SKILLS,
          title: 'Core Competencies',
          content: 'Live Operations | Page 2 3 | Release Planning | Analytics',
        },
        {
          type: BaselineSectionType.EDUCATION,
          title: 'Education',
          content: 'B.A. Media Arts | University of Washington | Page 1',
        },
      ] as any,
      {
        fullName: 'Greg Armstrong',
        location: 'Kirkland, WA | Page 1 | (703) 850-7289 | 3',
      } as any,
    );

    const serialized = JSON.stringify(document);
    expect(serialized).not.toMatch(/\bPage\s+\d/i);
    expect(serialized).not.toContain('"3"');

    const validation = validateNormalizedResumeDocument(document);
    expect(validation.valid).toBe(true);
    expect(validation.reasons).toEqual([]);
  });

  it('merges wrapped bullet lines and removes leaked role suffix fragments', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Constructed analytics infrastructure encompassing 100+ behavioral tracking dashboards that informed all',
          '- strategic design decisions and performance optimization.',
          '- Owned live-ops planning and release execution - Senior Game Designer',
        ].join('\n'),
        bullets: [
          {
            text: 'Constructed analytics infrastructure encompassing 100+ behavioral tracking dashboards that informed all',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'strategic design decisions and performance optimization.',
            source: { experienceEntryIndex: 0 },
          },
          {
            text: 'Owned live-ops planning and release execution - Senior Game Designer',
            source: { experienceEntryIndex: 0 },
          },
        ] as any,
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.bullets).toEqual([
      'Constructed analytics infrastructure encompassing 100+ behavioral tracking dashboards that informed all strategic design decisions and performance optimization.',
      'Owned live-ops planning and release execution',
    ]);
  });

  it('merges wrapped lines before dedupe and strips leaked role fragments anywhere in bullets', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Built telemetry coverage for progression systems that improved signal quality across gameplay loops',
          '- and reduced iteration latency for release planning.',
          '- Built telemetry coverage for progression systems that improved signal quality across gameplay loops and reduced iteration latency for release planning.',
          '- Drove collaboration across product and engineering - Lead Game Designer - to stabilize release cadence.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.bullets).toEqual([
      'Built telemetry coverage for progression systems that improved signal quality across gameplay loops and reduced iteration latency for release planning.',
      'Drove collaboration across product and engineering to stabilize release cadence.',
    ]);
  });

  it('merges continuation content lines before bullet extraction and strips role suffixes', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Constructed analytics infrastructure encompassing 100+ behavioral tracking dashboards that informed all',
          'strategic design decisions and performance optimization.',
          '- Owned live-ops planning and release execution - Game Designer',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.bullets).toEqual([
      'Constructed analytics infrastructure encompassing 100+ behavioral tracking dashboards that informed all strategic design decisions and performance optimization.',
      'Owned live-ops planning and release execution',
    ]);
  });

  it('reconstructs PDF-wrapped bullet fragments before extraction and dedupes duplicates', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Launched signature interactive features including SuperStar Spinner, Alt. Positions,',
          'Courtside Pass, and',
          'reward-track improvements that increased engagement.',
          '- Launched signature interactive features including SuperStar Spinner, Alt. Positions, Courtside Pass, and reward-track improvements that increased engagement.',
          '- Owned live-ops planning with cross-functional release coordination.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.bullets).toEqual([
      'Launched signature interactive features including SuperStar Spinner, Alt. Positions, Courtside Pass, and reward-track improvements that increased engagement.',
      'Owned live-ops planning with cross-functional release coordination.',
    ]);
  });

  it('collapses duplicate reconstructed bullet lines within a single experience entry', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Improved reward progression balancing for seasonal events',
          'across multiple player cohorts.',
          '- Improved reward progression balancing for seasonal events across multiple player cohorts.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.bullets).toEqual([
      'Improved reward progression balancing for seasonal events across multiple player cohorts.',
    ]);
  });

  it('flags duplicate role headers and collapsed punctuation noise during validation', () => {
    const document = normalizeNormalizedResumeDocument({
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com | (703) 850-7289' },
      summary: 'Operations leader',
      experience: [
        {
          company: 'Acme',
          roleTitle: 'Support Manager',
          dateRange: '2020 - 2024',
          bullets: ['Led incident governance...::::'],
        },
        {
          company: 'Acme',
          roleTitle: 'Support Manager',
          dateRange: '2020 - 2024',
          bullets: ['Improved response quality.'],
        },
      ],
      education: [{ institution: 'University of Example', degree: 'MBA' }],
    } as any);

    const validation = validateNormalizedResumeDocument(document);
    expect(validation.valid).toBe(false);
    expect(validation.reasons.join(' ')).toContain('Duplicate role headers');
    expect(validation.reasons.join(' ')).toContain('Collapsed punctuation noise');
  });

  it('flags malformed merged experience blobs during validation', () => {
    const oversized = `Led service delivery outcomes ${'across enterprise workflows '.repeat(30)}`.trim();
    const validation = validateNormalizedResumeDocument({
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      experience: [
        {
          company: 'Acme',
          roleTitle: 'Support Manager',
          bullets: [oversized],
        },
      ],
      education: [{ institution: 'University of Example' }],
    } as any);

    expect(validation.valid).toBe(false);
    expect(validation.reasons.join(' ')).toContain('Experience section appears malformed');
  });

  it('merges bullet continuations ending with including and across when next line is lowercase', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Built live event frameworks including',
          'cross-functional tuning loops across',
          'player lifecycle segments and retention windows.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]?.bullets).toEqual([
      'Built live event frameworks including cross-functional tuning loops across player lifecycle segments and retention windows.',
    ]);
  });

  it('dedupes bullets within a role but keeps identical bullets across different roles', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Led live operations roadmap delivery across multiple game releases.',
          '- Led live operations roadmap delivery across multiple game releases.',
          'MobilityWare | Irvine, CA | 2016 - 2020',
          'Producer',
          '- Led live operations roadmap delivery across multiple game releases.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0]?.bullets).toEqual([
      'Led live operations roadmap delivery across multiple game releases.',
    ]);
    expect(document.experience[1]?.bullets).toEqual([
      'Led live operations roadmap delivery across multiple game releases.',
    ]);
  });

  it('deduplicates education entries structurally by degree institution and location', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EDUCATION,
        title: 'Education',
        content: [
          'B.A. Media Arts | University of Washington | Seattle, WA',
          'B.A. Media Arts | University of Washington|Seattle, WA',
          'B.A. Media Arts | University of Washington | Seattle, WA',
        ].join('\n'),
      },
    ] as any);

    expect(document.education).toHaveLength(1);
    expect(document.education?.[0]).toMatchObject({
      degree: 'B.A. Media Arts',
      institution: 'University of Washington',
      location: 'Seattle, WA',
    });
  });

  it('normalizes OCR typos in role titles only', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senir Producer Desginer',
          '- Delivered tooling improvements for live operations planning.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience[0]?.roleTitle).toBe('Senior Producer Designer');
    expect(document.experience[0]?.bullets[0]).toContain('Delivered tooling improvements');
  });

  it('tightens verbose bullets while preserving metrics and role names', () => {
    const document = buildNormalizedResumeDocument([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: [
          'Cat Daddy Games | Kirkland, WA | 2020 - 2025',
          'Senior Game Designer',
          '- Engineered revenue optimization systems generating peak daily earnings of $150K through strategic feature development and iterative experimentation with extensive stakeholder coordination.',
          '- Partnered directly with Senior Producer leadership to align delivery milestones and risk controls.',
        ].join('\n'),
      },
    ] as any);

    expect(document.experience).toHaveLength(1);
    const bullets = document.experience[0]?.bullets ?? [];
    expect(bullets[0]).toContain('$150K');
    expect(bullets[0]).toContain('revenue optimization systems');
    expect(bullets[0]).not.toContain('extensive');
    expect(bullets[1]).toContain('Senior Producer');
  });

  it('deduplicates education entries before renderer mapping', () => {
    const model = mapNormalizedResumeToDocxModel({
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      experience: [
        {
          company: 'Employer Alpha',
          roleTitle: 'Program Manager',
          bullets: ['Led delivery cadences.'],
        },
      ],
      education: [
        {
          degree: 'B.A. Media Arts',
          institution: 'University of Washington',
          location: 'Seattle, WA',
        },
        {
          degree: 'B.A. Media Arts',
          institution: 'University of Washington',
          location: 'Seattle, WA',
        },
      ],
    } as any);

    const educationSection = model.sections.find((section) => section.key === 'education');
    expect(educationSection?.items).toHaveLength(1);
  });

  it('applies generalized structure rules across gaming, support, and business operation fixtures', async () => {
    const fixtures = [
      {
        label: 'gaming-style',
        sections: [
          {
            type: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: [
              'Metro City, WA',
              'Studio Alpha',
              '2020 - 2024',
              '- Launched seasonal event systems across live game releases.',
              '',
              'Remote',
              'Studio Beta',
              '2017 - 2020',
              '- Built content pipelines for live updates.',
            ].join('\n'),
          },
          {
            type: BaselineSectionType.EDUCATION,
            title: 'Education',
            content: [
              'M.S. Interactive Systems | Institute One | Metro City, WA',
              'M.S. Interactive Systems | Institute One | Metro City, WA',
            ].join('\n'),
          },
        ],
      },
      {
        label: 'support-operations-style',
        sections: [
          {
            type: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: [
              'Support Operations Manager | Service Platform Co | 2019 - Present',
              '- Led incident command and escalation operations.',
              '',
              'Support Program Lead | Helpdesk Systems | 2016 - 2019',
              '- Reduced queue backlog through workflow automation.',
            ].join('\n'),
          },
          {
            type: BaselineSectionType.EDUCATION,
            title: 'Education',
            content: [
              'B.S. Information Systems | Institute Two | River City, OR',
              'B.S. Information Systems | Institute Two | River City, OR',
            ].join('\n'),
          },
        ],
      },
      {
        label: 'business-operations-style',
        sections: [
          {
            type: BaselineSectionType.EXPERIENCE,
            title: 'Experience',
            content: [
              'Operations Program Manager | Business Ops Group | 2018 - 2022',
              '- Delivered quarterly operating rhythm across regional teams.',
              '',
              'Business Analyst | Portfolio Services | 2015 - 2018',
              '- Improved forecast accuracy through planning model updates.',
            ].join('\n'),
          },
          {
            type: BaselineSectionType.EDUCATION,
            title: 'Education',
            content: [
              'MBA | Institute Three | Bay City, CA',
              'MBA | Institute Three | Bay City, CA',
            ].join('\n'),
          },
        ],
      },
    ] as const;

    for (const fixture of fixtures) {
      const document = buildNormalizedResumeDocument(fixture.sections as any);
      expect(document.experience.length).toBeGreaterThanOrEqual(2);

      const first = document.experience[0]!;
      const second = document.experience[1]!;
      expect(first.company.length).toBeGreaterThan(0);
      expect(second.company.length).toBeGreaterThan(0);
      // Role titles may legitimately be empty when the input has no safely extractable title line.
      expect(typeof first.roleTitle).toBe('string');
      expect(typeof second.roleTitle).toBe('string');
      expect(first.bullets.length).toBeGreaterThan(0);
      expect(second.bullets.length).toBeGreaterThan(0);

      const model = mapNormalizedResumeToDocxModel(document);
      const xml = await renderDocumentXml(model);
      const paragraphs = extractParagraphXml(xml);
      const firstHeaderParagraphIndex = paragraphs.findIndex((p) =>
        p.includes(first.company),
      );
      const firstBulletParagraphIndex = paragraphs.findIndex((p) =>
        p.includes(first.bullets[0]),
      );
      const secondHeaderParagraphIndex = paragraphs.findIndex((p) =>
        p.includes(second.company),
      );
      const secondHeaderParagraph = paragraphs[secondHeaderParagraphIndex] ?? '';

      expect(firstHeaderParagraphIndex).toBeGreaterThanOrEqual(0);
      expect(firstBulletParagraphIndex).toBeGreaterThan(firstHeaderParagraphIndex);
      expect(secondHeaderParagraphIndex).toBeGreaterThan(firstBulletParagraphIndex);
      expect(secondHeaderParagraph).toContain('w:before="220"');
      expect(paragraphs[secondHeaderParagraphIndex]).not.toContain('<w:numPr>');

      const educationSection = model.sections.find((section) => section.key === 'education');
      expect(educationSection?.items).toHaveLength(1);
      expect(
        (educationSection?.items?.[0] as { raw?: string } | undefined)?.raw?.includes(' | '),
      ).toBe(true);
    }
  });

  it('does not contain fixture-specific string matching in normalization or renderer source', () => {
    const sourcePaths = [
      resolve(__dirname, 'resume-normalization.ts'),
      resolve(__dirname, '../docx-templates/templates/resume/classic-professional-v1.ts'),
    ];
    const forbiddenFixtureTokens = [
      'greg armstrong',
      'cat daddy',
      'mobilityware',
      'playstudios',
      'max axe',
      'kirkland',
      'superstar spinner',
      'courtside pass',
      'myplayer store',
      'university of central florida',
      'george mason',
      'deployment timelines',
      'mathematical',
    ];

    for (const path of sourcePaths) {
      const source = readFileSync(path, 'utf8').toLowerCase();
      for (const forbiddenToken of forbiddenFixtureTokens) {
        expect(source).not.toContain(forbiddenToken);
      }
    }
  });
});
