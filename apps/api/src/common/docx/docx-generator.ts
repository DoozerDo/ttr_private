import { Document, Packer, Paragraph, TextRun } from 'docx';

export async function createDocxBuffer(content: string): Promise<Buffer> {
  const normalized = content.replace(/\r\n/g, '\n');
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const children = blocks.map((block) =>
    new Paragraph({ children: [new TextRun(block)] }),
  );

  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun('')] }));
  }

  const document = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(document);
  return Buffer.from(buffer);
}
