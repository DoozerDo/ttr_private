import { extractStructuredBaselineFromSections } from './structuredBaselineExtractor';

describe('structuredBaselineExtractor', () => {
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
