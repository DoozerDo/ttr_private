import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Paragraph,
  Packer,
  TabStopType,
  TextRun,
} from 'docx';
import { registerDocxTemplate } from '../../docx-template.registry';
import {
  DocxRenderContextBase,
  DocxTemplateDefinition,
  DocxTemplateKind,
  DocxTemplateKey,
  ResumeDocxModel,
} from '../../docx-template.types';

const templateKey: DocxTemplateKey = 'classic_professional_v1';

function createHeaderParagraph(text: string, size: number, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text, size, bold, font: 'Calibri' })],
  });
}

function createSectionHeader(text: string) {
  return new Paragraph({
    spacing: { before: 160, after: 80, line: 276 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: 'D9D9D9',
      },
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 24,
        font: 'Calibri',
      }),
    ],
  });
}

function createSummaryParagraph(text: string) {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
  });
}

function createSkillsParagraph(line: string) {
  return new Paragraph({
    spacing: { after: 60, line: 276 },
    children: [new TextRun({ text: line, size: 22, font: 'Calibri' })],
  });
}

function createExperienceRoleParagraph(role: string, dateRange?: string) {
  const children: TextRun[] = [
    new TextRun({ text: role, bold: true, size: 26, font: 'Calibri' }),
  ];
  if (dateRange) {
    children.push(new TextRun({ text: '\t', size: 26 }));
    children.push(
      new TextRun({
        text: dateRange,
        size: 22,
        italics: true,
        font: 'Calibri',
      }),
    );
  }
  return new Paragraph({
    spacing: { after: 40, line: 276 },
    tabStops: [
      {
        type: TabStopType.RIGHT,
        position: 9100,
      },
    ],
    children,
  });
}

function createCompanyParagraph(company?: string) {
  if (!company) {
    return null;
  }
  return new Paragraph({
    spacing: { after: 40, line: 276 },
    children: [
      new TextRun({ text: company, italics: true, size: 24, font: 'Calibri' }),
    ],
  });
}

function createExperienceBullet(text: string) {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    indent: { left: 360 },
    numbering: {
      reference: 'resume-bullets',
      level: 0,
    },
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
  });
}

function createEducationParagraph(entry: string) {
  return new Paragraph({
    spacing: { after: 60, line: 276 },
    children: [new TextRun({ text: entry, size: 22, font: 'Calibri' })],
  });
}

function buildExperienceSection(experiences: ResumeDocxModel['experiences']) {
  const children: Paragraph[] = [];
  experiences?.forEach((experience) => {
    children.push(createExperienceRoleParagraph(experience.role, experience.dateRange));
    const companyParagraph = createCompanyParagraph(experience.company);
    if (companyParagraph) {
      children.push(companyParagraph);
    }
    experience.bullets.forEach((bullet) => {
      children.push(createExperienceBullet(bullet));
    });
    children.push(createParagraphSpacer());
  });
  return children;
}

function createParagraphSpacer() {
  return new Paragraph({ spacing: { after: 120, line: 276 }, children: [] });
}

function createEducationSection(entries: ResumeDocxModel['education']) {
  if (!entries?.length) return [];
  return entries.map((entry) => createEducationParagraph(entry));
}

function createCertificationsSection(entries: ResumeDocxModel['certifications']) {
  if (!entries?.length) return [];
  return entries.map((entry) => createEducationParagraph(entry));
}

function createSkillsSection(skillGroups: ResumeDocxModel['skills']) {
  const children: Paragraph[] = [];
  skillGroups?.forEach((group) => {
    const line = group.filter(Boolean).join(', ');
    if (line) {
      children.push(createSkillsParagraph(line));
    }
  });
  return children;
}

function createSummarySection(summary: ResumeDocxModel['summary']) {
  if (!summary?.length) return [];
  return summary.map((paragraph) => createSummaryParagraph(paragraph));
}

const template: DocxTemplateDefinition<ResumeDocxModel> = {
  kind: 'resume',
  key: templateKey,
  async render(model: ResumeDocxModel, context: DocxRenderContextBase) {
    const sections: Paragraph[] = [];

    if (model.header.name) {
      sections.push(createHeaderParagraph(model.header.name, 40, true));
    }
    if (model.header.title) {
      sections.push(createHeaderParagraph(model.header.title, 24));
    }
    model.header.contactLines?.forEach((line) => {
      sections.push(createHeaderParagraph(line, 20));
    });

    if (model.summary?.length) {
      sections.push(createSectionHeader('Summary'));
      sections.push(...createSummarySection(model.summary));
    }

    if (model.skills?.length) {
      sections.push(createSectionHeader('Skills'));
      sections.push(...createSkillsSection(model.skills));
    }

    if (model.experiences?.length) {
      sections.push(createSectionHeader('Experience'));
      sections.push(...buildExperienceSection(model.experiences));
    }

    if (model.education?.length) {
      sections.push(createSectionHeader('Education'));
      sections.push(...createEducationSection(model.education));
    }

    if (model.certifications?.length) {
      sections.push(createSectionHeader('Certifications'));
      sections.push(...createCertificationsSection(model.certifications));
    }

    const doc = new Document({
      numbering: {
        config: [
          {
            reference: 'resume-bullets',
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
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: context.margin?.top ?? 1440,
                right: context.margin?.right ?? 1440,
                bottom: context.margin?.bottom ?? 1440,
                left: context.margin?.left ?? 1440,
              },
            },
          },
          children: sections,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return {
      buffer: Buffer.from(buffer),
    };
  },
};

registerDocxTemplate(template);
