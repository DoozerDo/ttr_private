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
  ExperienceItem,
  ResumeDocxModel,
  ResumeDocxSection,
  ResumeEducationItem,
  ResumeSectionItem,
  ResumeSkillsGroup,
  ResumeSkillsItem,
  ResumeSummaryItem,
  ResumeCertificationItem,
  ResumeOtherItem,
} from '../../docx-template.types';

const templateKey: DocxTemplateKey = 'classic_professional_v1';
const defaultLineSpacing = 280;
const headerNameSize = 44;
const headerTitleSize = 26;
const headerContactSize = 20;
const headerBlockSpacingAfter = 200;
const sectionHeaderSpacingBefore = 180;
const sectionHeaderSpacingAfter = 90;
const skillLineSpacingAfter = 60;
const skillTabStopPosition = 9000;
const experienceEntrySpacingBefore = 220;
const experienceHeaderLineSpacingAfter = 40;
const experienceRoleMetaSpacingAfter = 84;
const bulletIndent = 720;
const bulletSpacingAfter = 50;
const descriptionSpacingAfter = 60;
const sectionSpacerSize = 120;

function createHeaderParagraph(
  text: string,
  options: { size: number; bold?: boolean; spacingAfter?: number },
) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: {
      line: defaultLineSpacing,
      after: options.spacingAfter ?? 0,
    },
    children: [
      new TextRun({
        text,
        size: options.size,
        bold: options.bold,
        font: 'Calibri',
      }),
    ],
  });
}

function createHeaderBlockSpacer() {
  return new Paragraph({
    spacing: {
      line: defaultLineSpacing,
      after: headerBlockSpacingAfter,
    },
    children: [],
  });
}

function createSectionHeader(text: string) {
  return new Paragraph({
    spacing: {
      before: sectionHeaderSpacingBefore,
      after: sectionHeaderSpacingAfter,
      line: defaultLineSpacing,
    },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 4,
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
    spacing: { after: 90, line: defaultLineSpacing },
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
  });
}

function createExperienceCompanyParagraph(
  company: string,
  options?: { spacingBefore?: number; showTopDivider?: boolean },
) {
  const normalized = company.trim();
  if (!normalized) {
    return null;
  }

  return new Paragraph({
    spacing: {
      before: options?.spacingBefore ?? 0,
      after: experienceHeaderLineSpacingAfter,
      line: defaultLineSpacing,
    },
    ...(options?.showTopDivider
      ? {
          border: {
            top: {
              style: BorderStyle.SINGLE,
              size: 2,
              color: 'E2E8F0',
            },
          },
        }
      : {}),
    children: [
      new TextRun({
        text: normalized,
        bold: true,
        size: headerTitleSize,
        font: 'Calibri',
      }),
    ],
  });
}

function createExperienceRoleMetaParagraph(role?: string, dateRange?: string, location?: string) {
  const meta = [role?.trim(), dateRange?.trim(), location?.trim()].filter(Boolean).join(' | ');
  if (!meta) {
    return null;
  }

  return new Paragraph({
    spacing: { after: experienceRoleMetaSpacingAfter, line: defaultLineSpacing },
    children: [
      new TextRun({
        text: meta,
        italics: true,
        size: 20,
        color: '4B5563',
        font: 'Calibri',
      }),
    ],
  });
}

function createDescriptionParagraph(text: string) {
  return new Paragraph({
    spacing: { after: descriptionSpacingAfter, line: defaultLineSpacing },
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
  });
}

function createExperienceBullet(text: string) {
  return new Paragraph({
    spacing: { after: bulletSpacingAfter, line: defaultLineSpacing },
    indent: { left: bulletIndent, hanging: 360 },
    numbering: {
      reference: 'resume-bullets',
      level: 0,
    },
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
  });
}

function splitBulletParagraphs(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[\u2022\u25CF\u25E6*\-]+\s*/, '').trim())
    .filter(Boolean);
}

function createEducationParagraph(entry: string) {
  return new Paragraph({
    spacing: { after: 60, line: 276 },
    children: [new TextRun({ text: entry, size: 22, font: 'Calibri' })],
  });
}

function createParagraphSpacer() {
  return new Paragraph({
    spacing: { before: sectionSpacerSize, line: defaultLineSpacing },
    children: [],
  });
}

function renderSection(section: ResumeDocxSection) {
  switch (section.key) {
    case 'summary':
      return renderSummarySection(section.items);
    case 'skills':
      return renderSkillsSection(section.items);
    case 'experience':
      return renderExperienceSection(section.items);
    case 'education':
      return renderEducationSection(section.items);
    case 'certifications':
      return renderCertificationSection(section.items);
    case 'other':
    default:
      return renderOtherSection(section.items);
  }
}

function renderSummarySection(items: ResumeSectionItem[]) {
  const children: Paragraph[] = [];
  items.filter(isSummaryItem).forEach((item) => {
    item.paragraphs.forEach((paragraph) => {
      const normalized = paragraph.trim();
      if (!normalized) return;
      children.push(createSummaryParagraph(normalized));
    });
  });
  return children;
}

function renderSkillsSection(items: ResumeSectionItem[]) {
  const children: Paragraph[] = [];
  items.filter(isSkillsItem).forEach((item) => {
    item.groups?.forEach((group) => {
      const paragraph = createSkillGroupParagraph(group);
      if (paragraph) {
        children.push(paragraph);
      }
    });
    item.lines?.forEach((line) => {
      const flow = createSkillFlowParagraph(line);
      if (flow) {
        children.push(flow);
      }
    });
  });
  return children;
}

function renderExperienceSection(items: ResumeSectionItem[]) {
  const experiences = items.filter(isExperienceItem);
  const children: Paragraph[] = [];
  experiences.forEach((experience, index) => {
    const companyParagraph = createExperienceCompanyParagraph(experience.company ?? '', {
      spacingBefore: index > 0 ? experienceEntrySpacingBefore : 0,
      showTopDivider: index > 0,
    });
    if (companyParagraph) {
      children.push(companyParagraph);
    }

    const roleMetaParagraph = createExperienceRoleMetaParagraph(
      experience.role,
      experience.dateRange,
      experience.location,
    );
    if (roleMetaParagraph) {
      children.push(roleMetaParagraph);
    }

    if (experience.description) {
      const description = experience.description.trim();
      if (description) {
        children.push(createDescriptionParagraph(description));
      }
    }

    experience.bullets.flatMap(splitBulletParagraphs).forEach((bullet) => {
      children.push(createExperienceBullet(bullet));
    });

  });
  return children;
}

function renderEducationSection(items: ResumeSectionItem[]) {
  const educationItems = items.filter(isEducationItem);
  const normalized = dedupeNormalizedEducationRows(
    educationItems.map((entry) => normalizeEducationEntryForRender(entry)),
  );
  const children: Paragraph[] = [];
  normalized.forEach((entry, index) => {
    if (entry.primary) {
      children.push(createEducationDegreeParagraph(entry.primary));
    }
    if (entry.secondary) {
      children.push(createEducationParagraph(entry.secondary));
    }
    if (index < normalized.length - 1) {
      children.push(createParagraphSpacer());
    }
  });
  return children;
}

function renderCertificationSection(items: ResumeSectionItem[]) {
  const certItems = items.filter(isCertificationItem);
  const certificationLines = certItems
    .map((entry) => formatCertificationLine(entry))
    .filter(
      (line): line is string => typeof line === 'string' && line.trim().length > 0,
    );
  return certificationLines.map((line) => createEducationParagraph(line));
}

function renderOtherSection(items: ResumeSectionItem[]) {
  const otherItems = items.filter(isOtherItem);
  const children: Paragraph[] = [];
  otherItems.forEach((item) => {
    item.lines
      .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
      .forEach((line) => {
        children.push(createEducationParagraph(line));
      });
  });
  return children;
}

function normalizeEducationTokenSet(value?: string | null): string[] {
  return String(value ?? '')
    .split(/[|¦｜]/)
    .map((token) => token.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((token, index, list) => {
      const key = canonicalizeEducationToken(token);
      if (!key) return false;
      return list.findIndex((item) => canonicalizeEducationToken(item) === key) === index;
    });
}

function canonicalizeEducationToken(token: string): string {
  return token
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:|./()[\]{}'"`-]+|[\s,;:|./()[\]{}'"`-]+$/g, '')
    .trim()
    .toLowerCase();
}

function createEducationDegreeParagraph(entry: string) {
  return new Paragraph({
    spacing: { after: 36, line: 276 },
    children: [new TextRun({ text: entry, bold: true, size: 22, font: 'Calibri' })],
  });
}

function normalizeEducationEntryForRender(entry: ResumeEducationItem): {
  degree: string;
  institution: string;
  location: string;
  extra: string;
  primary: string;
  secondary: string;
} {
  const degreeTokens = normalizeEducationTokenSet(entry.degree);
  const degreeTokenSet = new Set(degreeTokens.map(canonicalizeEducationToken));

  const institutionTokens = normalizeEducationTokenSet(entry.institution).filter((token) => {
    const key = canonicalizeEducationToken(token);
    return key.length > 0 && !degreeTokenSet.has(key);
  });
  const institutionTokenSet = new Set(institutionTokens.map(canonicalizeEducationToken));

  const detailTokens = (entry.details ?? [])
    .flatMap((detail) => normalizeEducationTokenSet(detail))
    .filter((token) => {
      const key = canonicalizeEducationToken(token);
      return (
        key.length > 0 &&
        !degreeTokenSet.has(key) &&
        !institutionTokenSet.has(key)
      );
    });
  const detailTokenSet = new Set(detailTokens.map(canonicalizeEducationToken));

  const dateTokens = normalizeEducationTokenSet(entry.dateRange).filter((token) => {
    const key = canonicalizeEducationToken(token);
    return (
      key.length > 0 &&
      !degreeTokenSet.has(key) &&
      !institutionTokenSet.has(key) &&
      !detailTokenSet.has(key)
    );
  });

  const degree = degreeTokens.join(' | ').trim();
  const institutionRaw = institutionTokens.join(' | ').trim();
  const location = detailTokens.join(' | ').trim();
  const extra = dateTokens.join(' | ').trim();
  const institution =
    institutionRaw && institutionRaw.toLowerCase() === degree.toLowerCase()
      ? ''
      : institutionRaw;

  const primary = degree;
  const secondaryParts = [institution, location, extra]
    .filter(Boolean)
    .filter(
      (token, index, list) =>
        list.findIndex((item) => item.toLowerCase() === token.toLowerCase()) === index,
    );
  const secondary = secondaryParts.join(' | ').trim();

  if (primary || secondary) {
    return { degree, institution, location, extra, primary, secondary };
  }

  const rawTokens = normalizeEducationTokenSet(entry.raw);
  const fallbackDegree = rawTokens[0]?.trim() ?? '';
  const fallbackInstitution = rawTokens[1]?.trim() ?? '';
  const fallbackLocation = rawTokens.slice(2).join(' | ').trim();
  const fallbackPrimary = fallbackDegree || rawTokens.join(' | ').trim();
  const fallbackSecondary = [fallbackInstitution, fallbackLocation]
    .filter(Boolean)
    .join(' | ')
    .trim();
  return {
    degree: fallbackDegree || fallbackPrimary,
    institution: fallbackInstitution,
    location: fallbackLocation,
    extra: '',
    primary: fallbackPrimary,
    secondary: fallbackSecondary,
  };
}

function dedupeNormalizedEducationRows(
  rows: Array<{
    degree: string;
    institution: string;
    location: string;
    extra: string;
    primary: string;
    secondary: string;
  }>,
): Array<{
  degree: string;
  institution: string;
  location: string;
  extra: string;
  primary: string;
  secondary: string;
}> {
  const canonicalizeField = (value: string): string =>
    normalizeEducationTokenSet(value)
      .map((token) => token.toLowerCase())
      .join('|');

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = [row.degree, row.institution, row.location, row.extra]
      .map((token) => canonicalizeField(token))
      .join('|');
    if (!key.replace(/\|/g, '').trim()) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatCertificationLine(entry: ResumeCertificationItem) {
  const parts = [
    entry.title,
    entry.organization,
    entry.dateRange,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' | ');
}

function createSkillGroupParagraph(group: ResumeSkillsGroup) {
  const values = group.values.filter(Boolean);
  if (!values.length) return null;
  const children: TextRun[] = [];
  if (group.label) {
    children.push(
      new TextRun({
        text: `${group.label}: `,
        bold: true,
        size: 22,
        font: 'Calibri',
      }),
    );
  }
  children.push(
    new TextRun({
      text: values.join(', '),
      size: 22,
      font: 'Calibri',
    }),
  );
  return new Paragraph({
    spacing: { after: skillLineSpacingAfter, line: defaultLineSpacing },
    children,
  });
}

function createSkillFlowParagraph(line: string) {
  const values = line
    .split(/[;,•]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!values.length) return null;
  const middle = Math.ceil(values.length / 2);
  const first = values.slice(0, middle).join(', ');
  const second = values.slice(middle).join(', ');
  const children: TextRun[] = [
    new TextRun({ text: first, size: 22, font: 'Calibri' }),
  ];
  const tabStops = second
    ? [
        {
          type: TabStopType.RIGHT,
          position: skillTabStopPosition,
        },
      ]
    : undefined;
  if (second) {
    children.push(new TextRun({ text: '\t', size: 22 }));
    children.push(new TextRun({ text: second, size: 22, font: 'Calibri' }));
  }
  return new Paragraph({
    tabStops,
    spacing: { after: skillLineSpacingAfter, line: defaultLineSpacing },
    children,
  });
}

function isSummaryItem(item: ResumeSectionItem): item is ResumeSummaryItem {
  return 'paragraphs' in item && Array.isArray(item.paragraphs);
}

function isSkillsItem(item: ResumeSectionItem): item is ResumeSkillsItem {
  return 'groups' in item || 'lines' in item;
}

function isExperienceItem(item: ResumeSectionItem): item is ExperienceItem {
  return 'role' in item && 'bullets' in item;
}

function isEducationItem(item: ResumeSectionItem): item is ResumeEducationItem {
  return 'raw' in item || 'institution' in item || 'degree' in item;
}

function isCertificationItem(item: ResumeSectionItem): item is ResumeCertificationItem {
  return 'title' in item && !('role' in item);
}

function isOtherItem(item: ResumeSectionItem): item is ResumeOtherItem {
  return 'lines' in item && !isSkillsItem(item);
}

const template: DocxTemplateDefinition<ResumeDocxModel> = {
  kind: 'resume',
  key: templateKey,
  async render(model: ResumeDocxModel, context: DocxRenderContextBase) {
    const sections: Paragraph[] = [];
    let headerRendered = false;

    if (model.header.name) {
      sections.push(
        createHeaderParagraph(model.header.name, {
          size: headerNameSize,
          bold: true,
          spacingAfter: 80,
        }),
      );
      headerRendered = true;
    }
    if (model.header.title) {
      sections.push(
        createHeaderParagraph(model.header.title, {
          size: headerTitleSize,
          bold: true,
          spacingAfter: 60,
        }),
      );
      headerRendered = true;
    }
    model.header.contactLines?.forEach((line) => {
      sections.push(
        createHeaderParagraph(line, {
          size: headerContactSize,
          spacingAfter: 40,
        }),
      );
      headerRendered = true;
    });
    if (headerRendered) {
      sections.push(createHeaderBlockSpacer());
    }

    model.sections.forEach((section) => {
      const rendered = renderSection(section);
      if (!rendered.length) return;
      sections.push(createSectionHeader(section.title));
      sections.push(...rendered);
    });

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
