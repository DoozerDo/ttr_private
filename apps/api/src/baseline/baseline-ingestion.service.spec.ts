import { BaselineIngestionService } from './baseline-ingestion.service';
import { BaselineParserService } from './baseline-parser.service';
import { BaselineTextExtractor } from './baseline-text-extractor.service';
import path from 'node:path';
import type { Express } from 'express';

describe('BaselineIngestionService', () => {
  const fixturesDir = path.join(__dirname, '..', '..', 'test', 'fixtures');
  const service = new BaselineIngestionService(
    new BaselineParserService(),
    new BaselineTextExtractor(),
  );

  const createFixtureFile = (
    filename: string,
    mimetype: string,
  ): Express.Multer.File => {
    return {
      originalname: filename,
      mimetype,
      path: path.join(fixturesDir, filename),
    } as Express.Multer.File;
  };

  it('parses the DOCX fixture into canonical schema', async () => {
    const result = await service.ingest(
      createFixtureFile(
        'baseline-sample.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    );

      expect(result.sourceFormat).toBe('docx');
      expect(result.canonical.identity.full_name).toBeTruthy();
      expect(result.canonical.experience.length).toBeGreaterThanOrEqual(0);
      expect(result.canonical.system_generated_read_only.missing_fields).toBeDefined();
  });

  it('parses the PDF fixture into canonical schema', async () => {
    const result = await service.ingest(
      createFixtureFile('baseline-sample.pdf', 'application/pdf'),
    );

    expect(result.sourceFormat).toBe('pdf');
    expect(result.canonical.identity.full_name).toBeTruthy();
    expect(result.canonical.tooling_and_platforms.ownership_level).toBe(
      'unknown',
    );
    expect(result.canonical.system_generated_read_only.low_confidence_extractions).toBeDefined();
  });

  it('capturess experience details text via parsing helper', () => {
    const context = { missingFields: [], ambiguityFlags: [], lowConfidence: [] };
    const block = `Acme Corp - Senior Product Manager\nMay 2020 - Present\n- Led strategy\n- Improved operations`; 
    const parsed = (service as any).parseExperienceBlock(block, context);

    expect(parsed).toBeTruthy();
    expect(parsed.details_text).toBe('May 2020 - Present\n- Led strategy\n- Improved operations');
    expect(parsed.scope_summary).toContain('Led strategy');
  });
});
