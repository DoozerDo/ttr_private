import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';

describe('structuredBaselineExtractor', () => {
  it('does not treat location-only lines like \"Seattle\" as employers (prevents city->company corruption)', () => {
    const original = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    try {
      const sections: any[] = [
        {
          sectionType: 'EXPERIENCE',
          content: [
            'Seattle',
            '- Reconciled billing and revenue across systems to improve close accuracy.',
            '- Reduced billing exceptions by automating metering and reporting checks.',
          ].join('\n'),
        },
      ];
      const structured = extractStructuredBaselineFromSections(sections as any);
      expect(structured.experience.length).toBe(0);
      expect(structured.missingEvidenceReasons.join(' ')).toMatch(/No safely structured experience entries found/i);
      expect(structured.diagnostics?.detectedExperienceHeaders ?? []).toEqual([]);
    } finally {
      if (typeof original === 'string') process.env.DOCGEN_DIAGNOSTICS = original;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('captures diagnostics for rejected headers (DOCGEN_DIAGNOSTICS=true) without including bullets', () => {
    const original = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    try {
      const sections: any[] = [
        {
          sectionType: 'EXPERIENCE',
          content: [
            'Seattle, WA | Support Operations Lead | 2022 - 2024',
            '- Led incident triage.',
          ].join('\n'),
        },
      ];
      const structured = extractStructuredBaselineFromSections(sections as any);
      expect(structured.experience.length).toBe(0);
      expect((structured.diagnostics?.detectedExperienceHeaders ?? []).length).toBeGreaterThan(0);
      expect((structured.diagnostics?.rejectedExperienceHeaders ?? []).length).toBeGreaterThan(0);
      // Safe-only: diagnostics must not contain bullet text.
      expect(JSON.stringify(structured.diagnostics ?? {})).not.toMatch(/incident triage/i);
    } finally {
      if (typeof original === 'string') process.env.DOCGEN_DIAGNOSTICS = original;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });

  it('parses role-company dash headers with following location/date lines', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Senior Manager, Customer Operations – SentinelOne',
          'Remote Dec 2022 – Aug 2025',
          '- Led incident triage and escalation management across support operations.',
          '',
          'Director, Cloud Development and Support – CenturyLink Business for Enterprise',
          'Seattle, WA Dec 2018 – Oct 2019',
          '- Reconciled billing and revenue across systems to improve close accuracy.',
          '',
          'Support Engineer – Microsoft',
          'United States 2006 – 2013',
          '- Supported enterprise customers and improved ticket response quality.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    const keys = structured.experience.map((e) => `${e.company}::${e.roleTitle}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        'SentinelOne::Senior Manager, Customer Operations',
        'CenturyLink Business for Enterprise::Director, Cloud Development and Support',
        'Microsoft::Support Engineer',
      ]),
    );

    const sentinel = structured.experience.find((e) => e.company === 'SentinelOne');
    expect(sentinel?.dates).toBe('Dec 2022 – Aug 2025');

    const centurylink = structured.experience.find((e) => e.company === 'CenturyLink Business for Enterprise');
    expect(centurylink?.dates).toBe('Dec 2018 – Oct 2019');

    const ms = structured.experience.find((e) => e.company === 'Microsoft');
    expect(ms?.dates).toBe('2006 – 2013');
  });

  it('extracts experience from section.content.rawContent when section.bullets is empty', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        bullets: [],
        content: {
          rawContent: [
            'Acme Corp | Senior Software Engineer | 2021 – 2024',
            'Led migration from monolith to services.',
            'Reduced latency by 35%.',
          ].join('\n'),
        },
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBeGreaterThan(0);
    expect(structured.experience[0].company).toBe('Acme Corp');
    expect(structured.experience[0].roleTitle).toBe('Senior Software Engineer');
    expect(structured.experience[0].bullets.length).toBeGreaterThan(0);
  });

  it('production-style resume extracts multiple authoritative experience groups', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Senior Manager, Customer Operations – SentinelOne',
          'Remote Dec 2022 – Aug 2025',
          '- Led incident triage and escalation management across support operations.',
          '- Built support playbooks and operating reviews to reduce escalations.',
          '',
          'Customer Operations Lead – Starbucks',
          'Seattle, WA 2020 – 2022',
          '- Led customer operations workflows and improved service reliability.',
          '',
          'Support Operations Manager – iStreamPlanet',
          'Seattle, WA 2019 – 2020',
          '- Improved queue health reporting and response time visibility.',
          '',
          'Director, Cloud Development and Support – CenturyLink Business for Enterprise',
          'Seattle, WA Dec 2018 – Oct 2019',
          '- Reconciled billing and revenue across systems to improve close accuracy.',
          '- Reduced billing exceptions by automating metering and reporting checks.',
          '- Partnered with finance stakeholders to close discrepancies and improve controls.',
          '',
          'Support Engineer – Microsoft',
          'United States 2006 – 2013',
          '- Supported enterprise customers and improved ticket response quality.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    const companies = structured.experience.map((e) => e.company);
    expect(structured.experience.length).toBeGreaterThan(4);
    expect(companies).toEqual(
      expect.arrayContaining([
        'SentinelOne',
        'Starbucks',
        'iStreamPlanet',
        'CenturyLink Business for Enterprise',
        'Microsoft',
      ]),
    );
  });

  it('keeps billing operations bullets under centurylink not sentinelone', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Senior Manager, Customer Operations – SentinelOne',
          'Remote Dec 2022 – Aug 2025',
          '- Led incident triage and escalation management across support operations.',
          '- Built support playbooks and operating reviews to reduce escalations.',
          '',
          'Director, Cloud Development and Support – CenturyLink Business for Enterprise',
          'Seattle, WA Dec 2018 – Oct 2019',
          '- Reconciled billing and revenue across systems to improve close accuracy.',
          '- Handled invoice disputes and credit workflows to improve billing reliability.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(2);
    const sentinel = structured.experience.find((e) => e.company === 'SentinelOne');
    const centurylink = structured.experience.find((e) => e.company === 'CenturyLink Business for Enterprise');
    expect(sentinel).toBeTruthy();
    expect(centurylink).toBeTruthy();

    const sentinelText = (sentinel?.bullets ?? []).join(' ').toLowerCase();
    expect(sentinelText).not.toMatch(/\b(billing|invoice|dispute|credit|metering|reconciliation)\b/);

    const centText = (centurylink?.bullets ?? []).join(' ').toLowerCase();
    expect(centText).toMatch(/\b(billing|invoice|dispute|credit|metering|reconciliation)\b/);
  });

  it('diagnostics include detected headers without raw bullets (production-style fixture)', () => {
    const original = process.env.DOCGEN_DIAGNOSTICS;
    process.env.DOCGEN_DIAGNOSTICS = 'true';
    try {
      const sections: any[] = [
        {
          sectionType: 'EXPERIENCE',
          content: [
            'Senior Manager, Customer Operations – SentinelOne',
            'Remote Dec 2022 – Aug 2025',
            '- Led incident triage and escalation management across support operations.',
          ].join('\n'),
        },
      ];

      const structured = extractStructuredBaselineFromSections(sections as any);
      expect(structured.diagnostics?.structuredBaselineExperienceCount).toBeGreaterThan(0);
      expect((structured.diagnostics?.detectedExperienceHeaders ?? []).length).toBeGreaterThan(0);
      const serialized = JSON.stringify(structured.diagnostics ?? {});
      expect(serialized).not.toMatch(/incident triage/i);
    } finally {
      if (typeof original === 'string') process.env.DOCGEN_DIAGNOSTICS = original;
      else delete process.env.DOCGEN_DIAGNOSTICS;
    }
  });
  it('parses company + inline date range on same line, with role title on next line', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso October 2023 – March 2024',
          'Senior Program Manager',
          '- Led support operations across global teams.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('October 2023 – March 2024');
    expect(structured.experience[0].bullets.length).toBeGreaterThan(0);
  });

  it('parses company/role headers even with blank spacer lines between them', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'PMB Performance',
          '',
          'Senior Manager, Customer Operations',
          'Dec 2022 – Aug 2025',
          '- Led incident triage and escalation management across support operations.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('PMB Performance');
    expect(structured.experience[0].roleTitle).toBe('Senior Manager, Customer Operations');
    expect(structured.experience[0].dates).toBe('Dec 2022 – Aug 2025');
  });

  it('treats PROFESSIONAL_EXPERIENCE sections as EXPERIENCE for structured extraction', () => {
    const sections: any[] = [
      {
        sectionType: 'PROFESSIONAL_EXPERIENCE',
        content: [
          'Warner Bros. Discovery',
          'Senior Program Manager',
          '2021 – 2024',
          '- Led cross-functional delivery across stakeholders.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Warner Bros. Discovery');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
  });

  it('parses split date range across two lines without treating end date as role title', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso October 2023',
          'March 2024',
          'Senior Program Manager',
          '- Led incident response and reliability work across teams.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('October 2023 – March 2024');
  });

  it('parses inline date range with hyphen and preserves company/role title separation', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso July 2024 - April 2026',
          'Senior Program Manager',
          '- Delivered measurable outcomes.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – April 2026');
  });

  it('parses present/current date ranges and does not assign dates as role title', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Biblioso April 2026 - Present',
          'Staff Program Manager',
          '- Led support operations.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Staff Program Manager');
    expect(structured.experience[0].dates).toBe('April 2026 – Present');
  });

  it('parses inline date range with en dash (–)', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: ['Biblioso July 2024 – April 2026', 'Senior Program Manager', '- Delivered outcomes.'].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – April 2026');
  });

  it('parses inline date range with em dash (—)', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: ['Biblioso July 2024 — April 2026', 'Senior Program Manager', '- Delivered outcomes.'].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Senior Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – April 2026');
  });

  it('parses inline date range using \"to Present\"', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: ['Biblioso July 2024 to Present', 'Staff Program Manager', '- Delivered outcomes.'].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.experience.length).toBe(1);
    expect(structured.experience[0].company).toBe('Biblioso');
    expect(structured.experience[0].roleTitle).toBe('Staff Program Manager');
    expect(structured.experience[0].dates).toBe('July 2024 – Present');
  });

  it('does not promote project/tech fragments into experience company headers (Vue 3), deck builder frontend)', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Vue 3), deck builder frontend August 2024 – Present',
          'Founder',
          '- Built a deck builder.',
          '',
          'AMS DataSerfs August 2022 – August 2024',
          'Infrastructure Engineer',
          '- Improved reliability.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    const companies = structured.experience.map((e) => e.company);
    expect(companies).not.toContain('Vue 3), deck builder frontend');
    expect(companies).toContain('AMS DataSerfs');
  });

  it('rejects subsection headings and wrapped fragments as company values', () => {
    const sections: any[] = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Automation & Monitoring',
          'Datacenter Operations',
          'Internal Web Applications',
          'Vue 3), deck builder frontend',
          '',
          'Of Fates Games LLC | Technical Architect & Full-Stack Engineer | May 2021 - Present',
          '- Built backend services and deployment automation.',
          '',
          'AMS DataSerfs, Inc. | Linux System Administrator | July 2024 - April 2026',
          '- Maintained Linux infrastructure and incident response.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    const companies = structured.experience.map((e) => e.company);
    expect(companies).toEqual(expect.arrayContaining(['Of Fates Games LLC', 'AMS DataSerfs, Inc.']));
    expect(companies).not.toContain('Vue 3), deck builder frontend');
    expect(companies).not.toContain('Automation & Monitoring');
    expect(companies).not.toContain('Datacenter Operations');
    expect(companies).not.toContain('Internal Web Applications');
  });

  it('parses role-first PDF ordering and preserves hybrid technical roles (Dalen-style fixture)', () => {
    const sections: any[] = [
      {
        sectionType: 'SUMMARY',
        content: 'Hybrid engineer with software, infrastructure, and lab experience.',
      },
      {
        sectionType: 'SKILLS',
        content: [
          'Python, PHP, Go, C/C++, JavaScript, TypeScript',
          '- Docker, GitHub Actions, Kubernetes',
          '- Ansible, Terraform',
          '- DNS, VPN, VLAN, firewalls',
        ].join('\n'),
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Technical Architect & Full-Stack Engineer',
          'Of Fates Games LLC',
          'May 2021 – Present',
          '- Built Nuxt 3 frontend and CMS + API layer.',
          '- Shipped Docker and GitHub Actions CI/CD pipelines.',
          '',
          'Linux System Administrator (on-site contractor for Microsoft SCHIE)',
          'AMS DataSerfs, Inc.',
          'August 2022 – August 2024',
          '- Managed Linux systems, VMs, DNS, and VPN connectivity.',
          '- Automated provisioning with Ansible and Terraform.',
          '',
          'Infrastructure Engineer',
          'Biblioso',
          'October 2023 – March 2024',
          '- Maintained Kubernetes workloads and CI/CD.',
          '',
          '1P Lab Technician',
          'Biblioso',
          'April 2022 – October 2023',
          '- Supported hardware lab operations and system imaging.',
          '',
          'Datacenter Technician & Full-Stack Developer',
          'Wowrack',
          'October 2016 – March 2021',
          '- Built internal web applications using Vue.js and Nuxt.',
          '- Managed networking, firewalls, VLAN, and DNS.',
          '',
          'Co-Founder',
          'Cascade Aerial Photography',
          'January 2015 – October 2016',
          '- Built and maintained customer-facing web presence.',
          '',
          'Webmaster & Photography Assistant',
          'Keith D Vincent Photography',
          'June 2013 – January 2015',
          '- Maintained site and assisted with studio operations.',
          '',
          'Technology Specialist',
          'OfficeMax / OfficeDepot',
          'October 2014 – November 2016',
          '- Supported customer systems and device troubleshooting.',
        ].join('\n'),
      },
    ];

    const structured = extractStructuredBaselineFromSections(sections as any);
    expect(structured.summary).toContain('Hybrid engineer');
    const companies = structured.experience.map((e) => e.company);
    expect(companies).toEqual(
      expect.arrayContaining([
        'Of Fates Games LLC',
        'AMS DataSerfs, Inc.',
        'Biblioso',
        'Wowrack',
        'Cascade Aerial Photography',
        'Keith D Vincent Photography',
        'OfficeMax / OfficeDepot',
      ]),
    );
    expect(structured.experience.length).toBe(8);

    const roles = structured.experience.map((e) => e.roleTitle);
    expect(roles).toContain('Technical Architect & Full-Stack Engineer');
    expect(roles).toContain('Linux System Administrator (on-site contractor for Microsoft SCHIE)');

    const wowrack = structured.experience.find((e) => e.company === 'Wowrack');
    expect(wowrack?.dates).toBe('October 2016 – March 2021');
    expect(wowrack?.bullets.join(' ')).toMatch(/Vue\.js/i);

    const skillsJoined = structured.skills.join(' | ');
    expect(skillsJoined).toMatch(/TypeScript/i);
    expect(skillsJoined).toMatch(/Docker/i);
    expect(skillsJoined).toMatch(/Kubernetes/i);
    expect(skillsJoined).toMatch(/Terraform/i);
  });
});
