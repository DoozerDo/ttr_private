import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Paragraph,
  Packer,
  TextRun,
} from 'docx';

export type ResumeDocxSection = {
  title?: string | null;
  content: string;
};

const bulletReference = 'resume-bullet-numbering';
const defaultLineSpacing = 276;
const knownHeaders = new Set([
  'SUMMARY',
  'TECHNICAL SKILLS',
  'SKILLS',
  'EXPERIENCE',
  'PROFESSIONAL EXPERIENCE',
  'EDUCATION',
  'CERTIFICATIONS',
  'KEY ACHIEVEMENTS',
]);

function createTextRun(
  text: string,
  options?: { size?: number; bold?: boolean; italic?: boolean },
) {
  return new TextRun({
    text,
    font: 'Calibri',
    size: options?.size ?? 22,
    bold: options?.bold ?? false,
    italics: options?.italic ?? false,
  });
}

function createParagraph(
  text: string,
  options?: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    spacingBefore?: number;
    spacingAfter?: number;
    indent?: number;
    borderBottom?: boolean;
  },
) {
  return new Paragraph({
    spacing: {
      line: defaultLineSpacing,
      before: options?.spacingBefore,
      after: options?.spacingAfter ?? 120,
    },
    indent: {
      left: options?.indent,
    },
    border: options?.borderBottom
      ? {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 6,
            color: 'D9D9D9',
          },
        }
      : undefined,
    children: [
      createTextRun(text, {
        size: options?.size,
        bold: options?.bold,
        italic: options?.italic,
      }),
    ],
  });
}

function isExperienceHeader(line: string) {
  const hasSeparator = line.includes('|');
  const hasYearRange = /\d{4}\s*[-–]\s*(\d{4}|present|Present)/.test(line);
  return hasSeparator || hasYearRange;
}

export async function createResumeDocxBuffer(
  sections: ResumeDocxSection[],
): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];
  let nameRendered = false;
  let contactLinesRendered = 0;
  let summaryBlockActive = false;
  let currentSectionTitle: string | null = null;
  let experienceBulletCount = 0;
  let experienceBlockActive = false;

  const addBlankSpacer = () =>
    paragraphs.push(createParagraph('', { spacingAfter: 200 }));

  const addParagraph = (text: string, options?: Parameters<typeof createParagraph>[1]) =>
    paragraphs.push(createParagraph(text, options));

  const addHeaderParagraph = (text: string) =>
    paragraphs.push(
      createParagraph(text, {
        bold: true,
        size: 28,
        spacingBefore: 160,
        spacingAfter: 120,
        borderBottom: true,
      }),
    );

  const addRoleParagraph = (text: string) =>
    paragraphs.push(
      createParagraph(text, {
        bold: true,
        size: 26,
        spacingAfter: 40,
      }),
    );

  const addCompanyParagraph = (text: string) =>
    paragraphs.push(
      createParagraph(text, {
        italic: true,
        size: 24,
        spacingAfter: 100,
      }),
    );

  const addBulletParagraph = (text: string) =>
    paragraphs.push(
      new Paragraph({
        spacing: { line: defaultLineSpacing, after: 120 },
        indent: { left: 360 },
        numbering: {
          reference: bulletReference,
          level: 0,
        },
        children: [createTextRun(text)],
      }),
    );

  const addSkillsParagraphs = (line: string) => {
    const skills = line
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);
    const chunkSize = 3;
    for (let i = 0; i < skills.length; i += chunkSize) {
      const chunk = skills.slice(i, i + chunkSize);
      addParagraph(chunk.join(', '), { spacingAfter: 80 });
    }
  };

  for (const section of sections) {
    const lines = section.content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (!nameRendered) {
        addParagraph(line, { bold: true, size: 40, spacingAfter: 160 });
        nameRendered = true;
        continue;
      }

      if (contactLinesRendered < 2) {
        addParagraph(line);
        contactLinesRendered += 1;
        continue;
      }

      const upper = line.toUpperCase();
      if (knownHeaders.has(upper)) {
        if (summaryBlockActive && upper !== 'SUMMARY') {
          summaryBlockActive = false;
          addBlankSpacer();
        }
        if (experienceBlockActive && experienceBulletCount > 0) {
          addBlankSpacer();
        }
        summaryBlockActive = upper === 'SUMMARY';
        experienceBlockActive = upper === 'EXPERIENCE';
        experienceBulletCount = 0;
        currentSectionTitle = upper;
        addHeaderParagraph(upper);
        continue;
      }

      if (currentSectionTitle === 'SKILLS' && line.includes(',')) {
        addSkillsParagraphs(line);
        continue;
      }

      const bulletMatch = line.match(/^[•-]\s+(.*)$/);
      if (bulletMatch) {
        addBulletParagraph(bulletMatch[1]);
        if (experienceBlockActive) {
          experienceBulletCount += 1;
        }
        continue;
      }

      if (isExperienceHeader(line)) {
        if (experienceBlockActive && experienceBulletCount > 0) {
          addBlankSpacer();
        }
        experienceBlockActive = true;
        experienceBulletCount = 0;
        currentSectionTitle = 'EXPERIENCE';
        const parts = line
          .split('|')
          .map((part) => part.trim())
          .filter(Boolean);
        const role = parts[0] ?? line;
        const company = parts.slice(1).join(' | ') || line;
        addRoleParagraph(role);
        addCompanyParagraph(company);
        continue;
      }

      addParagraph(line);
    }
  }

  const document = new Document({
    numbering: {
      config: [
        {
          reference: bulletReference,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22,
          },
          paragraph: {
            spacing: {
              line: defaultLineSpacing,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return Buffer.from(buffer);
}
