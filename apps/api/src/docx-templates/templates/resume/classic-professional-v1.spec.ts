import JSZip from 'jszip';
import { getDocxTemplate } from '../../docx-template.registry';
import type { ResumeDocxModel } from '../../docx-template.types';
import '../../templates';

async function renderDocumentXml(model: ResumeDocxModel): Promise<string> {
  const template = getDocxTemplate<ResumeDocxModel>('resume', 'classic_professional_v1');
  const result = await template.render(model, { templateKey: 'classic_professional_v1' });
  const zip = await JSZip.loadAsync(result.buffer);
  return zip.file('word/document.xml')!.async('text');
}

function extractParagraphXml(documentXml: string): string[] {
  return documentXml.match(/<w:p>[\s\S]*?<\/w:p>/g) ?? [];
}

describe('classic_professional_v1 resume renderer', () => {
  it('renders experience company as a new block with role and date metadata plus one bullet paragraph per bullet', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com | (703) 850-7289'],
      },
      sections: [
        {
          key: 'experience',
          title: 'Professional Experience',
          items: [
            {
              role: 'Senior Producer',
              company: 'Cat Daddy Games',
              location: 'Kirkland, WA',
              dateRange: '2020 - 2025',
              bullets: [
                'Led live operations roadmap delivery across multiple game releases.',
                'Improved release quality metrics through instrumentation.\nMentored producers on planning cadence.',
              ],
            },
          ],
        },
      ],
    });

    expect(xml).toContain('Cat Daddy Games');
    expect(xml).toContain('Senior Producer | 2020 - 2025 | Kirkland, WA');
    expect(xml).toContain('Led live operations roadmap delivery across multiple game releases.');
    expect(xml).toContain('Improved release quality metrics through instrumentation.');
    expect(xml).toContain('Mentored producers on planning cadence.');

    const bulletParagraphs = xml.match(/<w:numPr>/g) ?? [];
    expect(bulletParagraphs).toHaveLength(3);
  });

  it('starts each company header on a separated block between experience entries', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com | (703) 850-7289'],
      },
      sections: [
        {
          key: 'experience',
          title: 'Professional Experience',
          items: [
            {
              role: 'Senior Producer',
              company: 'Cat Daddy Games',
              dateRange: '2020 - 2025',
              bullets: ['Led live operations roadmap delivery across multiple game releases.'],
            },
            {
              role: 'Producer',
              company: 'MobilityWare',
              dateRange: '2016 - 2020',
              bullets: ['Drove roadmap execution for multiple mobile titles.'],
            },
          ],
        },
      ],
    });

    const catDaddyIndex = xml.indexOf('Cat Daddy Games');
    const firstBulletIndex = xml.indexOf('Led live operations roadmap delivery across multiple game releases.');
    const mobilityWareIndex = xml.indexOf('MobilityWare');

    expect(catDaddyIndex).toBeGreaterThanOrEqual(0);
    expect(firstBulletIndex).toBeGreaterThan(catDaddyIndex);
    expect(mobilityWareIndex).toBeGreaterThan(firstBulletIndex);
  });

  it('never renders company text inside a bullet paragraph container', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'experience',
          title: 'Professional Experience',
          items: [
            {
              role: 'Senior Producer',
              company: 'Cat Daddy Games',
              dateRange: '2020 - 2025',
              bullets: ['Led live operations roadmap delivery across multiple game releases.'],
            },
            {
              role: 'Producer',
              company: 'Monopoly Solitaire',
              dateRange: '2018 - 2020',
              bullets: ['Shipped progression updates for Monopoly Solitaire live content.'],
            },
          ],
        },
      ],
    });

    const paragraphs = extractParagraphXml(xml);
    const companyParagraph = paragraphs.find((p) => p.includes('Cat Daddy Games'));
    const nextCompanyParagraph = paragraphs.find((p) => p.includes('Monopoly Solitaire'));
    expect(companyParagraph).toBeDefined();
    expect(nextCompanyParagraph).toBeDefined();
    expect(companyParagraph).not.toContain('<w:numPr>');
    expect(nextCompanyParagraph).not.toContain('<w:numPr>');
  });

  it('adds strong spacing and a subtle divider before subsequent company headers', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'experience',
          title: 'Professional Experience',
          items: [
            {
              role: 'Senior Producer',
              company: 'Cat Daddy Games',
              dateRange: '2020 - 2025',
              bullets: ['Led live operations roadmap delivery across multiple game releases.'],
            },
            {
              role: 'Producer',
              company: 'MobilityWare',
              dateRange: '2016 - 2020',
              bullets: ['Drove roadmap execution for multiple mobile titles.'],
            },
          ],
        },
      ],
    });

    const paragraphs = extractParagraphXml(xml);
    const firstBulletParagraphIndex = paragraphs.findIndex((paragraph) =>
      paragraph.includes('Led live operations roadmap delivery across multiple game releases.'),
    );
    const nextCompanyParagraphIndex = paragraphs.findIndex((paragraph) =>
      paragraph.includes('MobilityWare'),
    );
    const nextCompanyParagraph = paragraphs[nextCompanyParagraphIndex];
    expect(nextCompanyParagraph).toBeDefined();
    expect(nextCompanyParagraph).toContain('w:before="220"');
    expect(nextCompanyParagraph).toContain('<w:top w:val="single"');
    expect(nextCompanyParagraphIndex).toBeGreaterThan(firstBulletParagraphIndex);
  });

  it('renders next company in a new paragraph after bullet paragraphs', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'experience',
          title: 'Professional Experience',
          items: [
            {
              role: 'Principal Program Manager',
              company: 'Employer One',
              dateRange: '2020 - 2025',
              bullets: ['Led complex delivery across cross-functional programs.'],
            },
            {
              role: 'Program Manager',
              company: 'Employer Two',
              dateRange: '2016 - 2020',
              bullets: ['Drove roadmap execution for multiple products.'],
            },
          ],
        },
      ],
    });

    const paragraphs = extractParagraphXml(xml);
    const firstHeaderParagraphIndex = paragraphs.findIndex((p) => p.includes('Employer One'));
    const firstBulletParagraphIndex = paragraphs.findIndex((p) =>
      p.includes('Led complex delivery across cross-functional programs.'),
    );
    const secondHeaderParagraphIndex = paragraphs.findIndex((p) => p.includes('Employer Two'));
    const secondHeaderParagraph = paragraphs[secondHeaderParagraphIndex] ?? '';

    expect(firstHeaderParagraphIndex).toBeGreaterThanOrEqual(0);
    expect(firstBulletParagraphIndex).toBeGreaterThan(firstHeaderParagraphIndex);
    expect(secondHeaderParagraphIndex).toBeGreaterThan(firstBulletParagraphIndex);
    expect(secondHeaderParagraph).toContain('w:before="220"');
    expect(secondHeaderParagraph).toContain('<w:top w:val="single"');
    expect(paragraphs[secondHeaderParagraphIndex]).not.toContain('<w:numPr>');
  });

  it('applies hierarchy formatting with stronger company line and lighter role/date line', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com | (703) 850-7289'],
      },
      sections: [
        {
          key: 'experience',
          title: 'Professional Experience',
          items: [
            {
              role: 'Senior Producer',
              company: 'Cat Daddy Games',
              location: 'Kirkland, WA',
              dateRange: '2020 - 2025',
              bullets: ['Led live operations roadmap delivery across multiple game releases.'],
            },
          ],
        },
      ],
    });

    const companyIndex = xml.indexOf('Cat Daddy Games');
    const companySnippet = xml.slice(Math.max(0, companyIndex - 180), companyIndex + 80);
    expect(companySnippet).toContain('<w:b/>');

    const roleIndex = xml.indexOf('Senior Producer | 2020 - 2025 | Kirkland, WA');
    const roleSnippet = xml.slice(Math.max(0, roleIndex - 180), roleIndex + 120);
    expect(roleSnippet).toContain('<w:i/>');
    expect(roleSnippet).toContain('<w:color w:val="4B5563"');
  });

  it('suppresses empty summary and competencies sections', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'summary',
          title: 'Professional Summary',
          items: [{ paragraphs: ['   '] }],
        },
        {
          key: 'skills',
          title: 'Core Competencies',
          items: [{ lines: ['   '] }],
        },
      ],
    });

    expect(xml).not.toContain('PROFESSIONAL SUMMARY');
    expect(xml).not.toContain('CORE COMPETENCIES');
    expect(xml).not.toContain('• • •');
  });

  it('deduplicates identical education entries before rendering', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'education',
          title: 'Education',
          items: [
            {
              degree: 'B.A. Media Arts',
              institution: 'University of Washington',
              details: ['Seattle, WA'],
              raw: 'B.A. Media Arts | University of Washington | Seattle, WA',
            },
            {
              degree: 'B.A. Media Arts',
              institution: 'University of Washington',
              details: ['Seattle, WA'],
              raw: 'B.A. Media Arts | University of Washington | Seattle, WA',
            },
          ],
        },
      ],
    });

    const degreeMatches = xml.match(/B\.A\. Media Arts/g) ?? [];
    expect(degreeMatches).toHaveLength(1);
  });

  it('deduplicates merged education tokens within a single entry', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'education',
          title: 'Education',
          items: [
            {
              degree:
                'Master of Science in Interactive Entertainment Design & Production | Master of Science in Interactive Entertainment Design & Production',
              institution:
                'University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
              raw:
                'Master of Science in Interactive Entertainment Design & Production | Master of Science in Interactive Entertainment Design & Production | University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
            },
          ],
        },
      ],
    });

    const degreeMatches = xml.match(
      /Master of Science in Interactive Entertainment Design &amp; Production/g,
    ) ?? [];
    const schoolMatches = xml.match(/University of Central Florida, Orlando, FL/g) ?? [];
    expect(degreeMatches).toHaveLength(1);
    expect(schoolMatches).toHaveLength(1);
  });

  it('deduplicates education tokens despite trivial punctuation differences', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Alex Candidate',
        contactLines: ['alex@example.com'],
      },
      sections: [
        {
          key: 'education',
          title: 'Education',
          items: [
            {
              degree: 'MBA | MBA.',
              institution: 'University of Washington | University of Washington,',
              details: ['Seattle, WA | Seattle, WA.'],
            },
          ],
        },
      ],
    });

    const degreeMatches = xml.match(/MBA/g) ?? [];
    const schoolMatches = xml.match(/University of Washington/g) ?? [];
    const locationMatches = xml.match(/Seattle, WA/g) ?? [];
    expect(degreeMatches).toHaveLength(1);
    expect(schoolMatches).toHaveLength(1);
    expect(locationMatches).toHaveLength(1);
  });

  it('deduplicates cross-field education token leakage before render joins', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Alex Candidate',
        contactLines: ['alex@example.com'],
      },
      sections: [
        {
          key: 'education',
          title: 'Education',
          items: [
            {
              degree:
                'Master of Science in Interactive Entertainment Design & Production | Master of Science in Interactive Entertainment Design & Production',
              institution:
                'Master of Science in Interactive Entertainment Design & Production | University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
              details: [
                'University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
              ],
            },
          ],
        },
      ],
    });

    const degreeMatches =
      xml.match(/Master of Science in Interactive Entertainment Design &amp; Production/g) ?? [];
    const schoolMatches = xml.match(/University of Central Florida, Orlando, FL/g) ?? [];
    expect(degreeMatches).toHaveLength(1);
    expect(schoolMatches).toHaveLength(1);
    expect(xml).not.toContain(
      'Master of Science in Interactive Entertainment Design &amp; Production | Master of Science in Interactive Entertainment Design &amp; Production',
    );
    expect(xml).not.toContain(
      'University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
    );
  });

  it('deduplicates education rows by degree institution and location key', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'education',
          title: 'Education',
          items: [
            {
              degree: 'Bachelor of Arts in Art & Visual Technology',
              institution: 'George Mason University',
              details: ['Fairfax, VA'],
            },
            {
              degree:
                'Bachelor of Arts in Art & Visual Technology | Bachelor of Arts in Art & Visual Technology',
              institution: 'George Mason University | George Mason University',
              details: ['Fairfax, VA | Fairfax, VA'],
            },
          ],
        },
      ],
    });

    const degreeMatches = xml.match(/Bachelor of Arts in Art &amp; Visual Technology/g) ?? [];
    const schoolMatches = xml.match(/George Mason University/g) ?? [];
    const locationMatches = xml.match(/Fairfax, VA/g) ?? [];
    expect(degreeMatches).toHaveLength(1);
    expect(schoolMatches).toHaveLength(1);
    expect(locationMatches).toHaveLength(1);
  });

  it('renders Greg-style education rows once for MS and BA entries', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'education',
          title: 'Education',
          items: [
            {
              degree:
                'Master of Science in Interactive Entertainment Design & Production | Master of Science in Interactive Entertainment Design & Production',
              institution:
                'University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL',
            },
            {
              degree: 'Bachelor of Arts in Art & Visual Technology',
              institution: 'George Mason University, Fairfax, VA | George Mason University, Fairfax, VA',
            },
          ],
        },
      ],
    });

    const msMatches =
      xml.match(/Master of Science in Interactive Entertainment Design &amp; Production/g) ?? [];
    const baMatches = xml.match(/Bachelor of Arts in Art &amp; Visual Technology/g) ?? [];
    expect(msMatches).toHaveLength(1);
    expect(baMatches).toHaveLength(1);
  });

  it('preserves factual bullet content and metrics exactly', async () => {
    const xml = await renderDocumentXml({
      header: {
        name: 'Greg Armstrong',
        contactLines: ['greg@example.com'],
      },
      sections: [
        {
          key: 'experience',
          title: 'Professional Experience',
          items: [
            {
              role: 'Senior Producer',
              company: 'Cat Daddy Games',
              dateRange: '2020 - 2025',
              bullets: [
                'Engineered revenue optimization systems driving peak daily revenue of $150K through iterative feature experimentation.',
              ],
            },
          ],
        },
      ],
    });

    expect(xml).toContain(
      'Engineered revenue optimization systems driving peak daily revenue of $150K through iterative feature experimentation.',
    );
  });
});
