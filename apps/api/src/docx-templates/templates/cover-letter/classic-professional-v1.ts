import {
  AlignmentType,
  Document,
  Paragraph,
  Packer,
  TextRun,
} from 'docx';
import { registerDocxTemplate } from '../../docx-template.registry';
import {
  CoverLetterDocxModel,
  DocxRenderContextBase,
  DocxTemplateDefinition,
  DocxTemplateKey,
} from '../../docx-template.types';

const templateKey: DocxTemplateKey = 'classic_professional_v1';

function createDateParagraph(line: string) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text: line, size: 20, font: 'Calibri' })],
  });
}

function createGreetingParagraph(text: string) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, size: 22, bold: true, font: 'Calibri' })],
  });
}

function createBodyParagraph(text: string) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
  });
}

function createClosingParagraph(text: string) {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    children: [new TextRun({ text, size: 22, italics: true, font: 'Calibri' })],
  });
}

const template: DocxTemplateDefinition<CoverLetterDocxModel> = {
  kind: 'cover_letter',
  key: templateKey,
  async render(model: CoverLetterDocxModel, context: DocxRenderContextBase) {
    const sections: Paragraph[] = [];
    if (model.dateLine) {
      sections.push(createDateParagraph(model.dateLine));
    }
    sections.push(createGreetingParagraph(model.greeting));
    model.paragraphs.forEach((paragraph) => {
      sections.push(createBodyParagraph(paragraph));
    });
    model.closingLines?.forEach((line) => {
      sections.push(createClosingParagraph(line));
    });
    if (model.signatureName) {
      sections.push(
        new Paragraph({
          spacing: { after: 120, line: 276 },
          children: [new TextRun({ text: model.signatureName, size: 22, bold: true, font: 'Calibri' })],
        }),
      );
    }

    const doc = new Document({
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
    return { buffer: Buffer.from(buffer) };
  },
};

registerDocxTemplate(template);
