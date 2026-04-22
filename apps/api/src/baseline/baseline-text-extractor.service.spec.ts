import { BadRequestException } from '@nestjs/common';
import type { Express } from 'express';
import PizZip from 'pizzip';

import { BaselineTextExtractor } from './baseline-text-extractor.service';

jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));

const mammoth = jest.requireMock('mammoth') as {
  extractRawText: jest.Mock;
};

function makeDocxBufferFromDocumentXml(xml: string): Buffer {
  const zip = new PizZip();
  zip.file('word/document.xml', xml);
  // DOCX is a ZIP container; we keep the fixture minimal because the fallback
  // path reads document.xml directly.
  return zip.generate({ type: 'nodebuffer' });
}

describe('BaselineTextExtractor', () => {
  it('falls back to permissive DOCX text extraction when mammoth fails', async () => {
    mammoth.extractRawText.mockRejectedValueOnce(new Error('relationship parse failed'));

    const docXml = `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Talbert</w:t></w:r></w:p>
          <w:p><w:r><w:t>Bullets: \u2022 item one</w:t></w:r></w:p>
          <w:p>
            <w:hyperlink w:anchor="foo"><w:r><w:t>link text</w:t></w:r></w:hyperlink>
          </w:p>
        </w:body>
      </w:document>
    `;

    const file: Express.Multer.File = {
      originalname: 'Talbert.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: makeDocxBufferFromDocumentXml(docXml),
    } as Express.Multer.File;

    const extractor = new BaselineTextExtractor();
    const text = await extractor.extractText(file);

    expect(text).toContain('Talbert');
    expect(text).toContain('item one');
    expect(text).toContain('link text');
  });

  it('returns a typed 4xx when DOCX is not parseable', async () => {
    mammoth.extractRawText.mockRejectedValueOnce(new Error('mammoth failed'));

    const file: Express.Multer.File = {
      originalname: 'Talbert.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('not a zip'),
    } as Express.Multer.File;

    const extractor = new BaselineTextExtractor();
    await expect(extractor.extractText(file)).rejects.toBeInstanceOf(BadRequestException);
  });
});
