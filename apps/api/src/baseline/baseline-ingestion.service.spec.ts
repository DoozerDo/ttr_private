import { BaselineIngestionService } from './baseline-ingestion.service';
import { BaselineParserService } from './baseline-parser.service';
import { BaselineTextExtractor } from './baseline-text-extractor.service';
import path from 'node:path';
import type { Express } from 'express';

describe('BaselineIngestionService', () => {
  const fixturesDir = path.join(__dirname, '..', '..', 'test', 'fixtures');
  const parser = new BaselineParserService();
  const service = new BaselineIngestionService(parser, new BaselineTextExtractor());

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
    const parseSpy = jest.spyOn(parser, 'parseBaseline');
    const result = await service.ingest(
      createFixtureFile(
        'baseline-sample.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    );

      expect(parseSpy).toHaveBeenCalledWith(expect.any(String), { strategy: 'rules' });
      expect(result.sourceFormat).toBe('docx');
      expect(result.canonical.identity.full_name).toBeTruthy();
      expect(result.canonical.experience.length).toBeGreaterThanOrEqual(0);
      expect(result.canonical.system_generated_read_only.missing_fields).toBeDefined();
  });

  it('parses the PDF fixture into canonical schema', async () => {
    const parseSpy = jest.spyOn(parser, 'parseBaseline');
    const result = await service.ingest(
      createFixtureFile('baseline-sample.pdf', 'application/pdf'),
    );

    expect(parseSpy).toHaveBeenCalledWith(expect.any(String), { strategy: 'rules' });
    expect(result.sourceFormat).toBe('pdf');
    expect(result.canonical.identity.full_name).toBeTruthy();
    expect(result.canonical.tooling_and_platforms.ownership_level).toBe(
      'unknown',
    );
    expect(result.canonical.system_generated_read_only.low_confidence_extractions).toBeDefined();
  });

  it('extracts atomic evidence units with metrics', () => {
    const context = { missingFields: [], ambiguityFlags: [], lowConfidence: [] };
    const block = `Acme Corp | Senior Product Manager | May 2020 - Present\n- Led strategy that improved conversion by 25%\n- Drove $120,000 in savings`;
    const parsed = (service as any).parseExperienceBlock(block, context);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].evidence).toHaveLength(2);
    expect(parsed[0].evidence[0].metrics.length).toBeGreaterThan(0);
    expect(parsed[0].evidence[0].text).toContain('Led strategy');
  });

  it('drops contact, header, and summary noise from experience evidence', () => {
    const context = { missingFields: [], ambiguityFlags: [], lowConfidence: [] };
    const block = [
      'Acme Corp | Senior Product Manager | May 2020 - Present',
      'jane.doe@example.com | Seattle, WA',
      'Professional Summary',
      'Remote Dec 2022 - Aug 2025',
      '- Led strategy that improved conversion by 25%',
      '- Drove $120,000 in savings',
    ].join('\n');

    const parsed = (service as any).parseExperienceBlock(block, context);
    expect(parsed).toHaveLength(1);
    const evidenceTexts = parsed[0].evidence.map((entry: any) => String(entry?.text ?? '')).join(' | ');
    expect(evidenceTexts).toContain('Led strategy that improved conversion by 25%');
    expect(evidenceTexts).toContain('Drove $120,000 in savings');
    expect(evidenceTexts).not.toMatch(/jane\.doe@example\.com|Seattle, WA|Professional Summary|Remote Dec 2022/i);
  });

  it('recovers split header work history blocks where company, role, and dates are on adjacent lines', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA',
      '',
      'EXPERIENCE',
      'Acme Support',
      'Senior Support Operations Manager',
      'Remote Dec 2022 - Aug 2025',
      '- Led incident response and escalation handling across support operations.',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(1);
    expect(result.canonical.experience[0]).toMatchObject({
      company: 'Acme Support',
      role: 'Senior Support Operations Manager',
      start_date: 'Dec 2022',
      end_date: 'Aug 2025',
    });
    expect(result.canonical.experience[0].evidence).toHaveLength(1);
  });

  it('recovers split header work history blocks when the date line uses pipe separators', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA',
      '',
      'EXPERIENCE',
      'Acme Support',
      'Senior Support Operations Manager',
      '2021 | Present',
      '- Led incident response and escalation handling across support operations.',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(1);
    expect(result.canonical.experience[0]).toMatchObject({
      company: 'Acme Support',
      role: 'Senior Support Operations Manager',
      start_date: '2021',
      end_date: 'Present',
    });
  });

  it('records redacted candidate diagnostics for experience.date_range rejections', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA',
      '',
      'EXPERIENCE',
      'Acme Support',
      'Senior Support Operations Manager',
      'Dec 2022',
      '- Led incident response and escalation handling across support operations at https://example.com.',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(0);
    expect(result.trace?.baselineIngestion?.rejectionReasons).toEqual(
      expect.arrayContaining(['experience.date_range']),
    );
    expect(result.trace?.baselineIngestion?.dateRangeRejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateBlockIndex: 0,
          redactedHeaderLines: expect.arrayContaining([
            'Acme Support',
            'Senior Support Operations Manager',
            'Dec 2022',
          ]),
          detectedDateLikeFragments: expect.arrayContaining(['Dec 2022']),
          normalizedDateCandidate: expect.stringContaining('Dec 2022'),
          dateParserRejectionReason: 'experience.date_range',
          companyDetected: true,
          roleDetected: true,
        }),
      ]),
    );
    expect((result.trace?.baselineIngestion?.dateRangeRejections?.[0]?.redactedHeaderLines ?? []).length).toBeLessThanOrEqual(4);
  });

  it('splits flattened experience text into separate candidate blocks and maps entries without dates', () => {
    const content = [
      'Acme Support | Senior Support Operations Manager',
      '- Led incident response and escalation handling across support operations.',
      '- Built runbooks and workflow automation to improve SLA adherence.',
      '',
      'Beta Support | Support Operations Manager',
      '- Owned support queue health, staffing tradeoffs, and recurring issue follow-up.',
      '- Improved reporting and automation to reduce manual toil.',
      '',
      'CERTIFICATIONS',
      '- AWS Certified Solutions Architect',
    ].join('\n');

    const blocks = (service as any).groupExperienceBlocks(content);
    expect(blocks).toHaveLength(2);

    const context = { missingFields: [], ambiguityFlags: [], lowConfidence: [] };
    const mapped = blocks.flatMap((block: string, index: number) =>
      (service as any).parseExperienceBlock(block, context, undefined, index),
    );

    expect(mapped).toHaveLength(2);
    expect(mapped.map((entry: any) => `${entry.company}::${entry.role}`)).toEqual(
      expect.arrayContaining([
        'Acme Support::Senior Support Operations Manager',
        'Beta Support::Support Operations Manager',
      ]),
    );
    expect(mapped.every((entry: any) => !entry.start_date && !entry.end_date)).toBe(true);
    expect(mapped.every((entry: any) => Array.isArray(entry.evidence) && entry.evidence.length > 0)).toBe(true);
    const evidenceText = mapped.flatMap((entry: any) => entry.evidence.map((item: any) => String(item?.text ?? ''))).join(' | ');
    expect(evidenceText).not.toMatch(/AWS Certified Solutions Architect/i);
  });

  it('recovers split header work history blocks where role and company appear on adjacent lines', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA',
      '',
      'EXPERIENCE',
      'Senior Support Operations Manager',
      'Acme Support',
      'Dec 2022 - Aug 2025',
      '- Led incident response and escalation handling across support operations.',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(1);
    expect(result.canonical.experience[0]).toMatchObject({
      company: 'Acme Support',
      role: 'Senior Support Operations Manager',
      start_date: 'Dec 2022',
      end_date: 'Aug 2025',
    });
  });

  it('recovers split header work history blocks where role and company share one line and dates follow on the next line', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA',
      '',
      'EXPERIENCE',
      'Senior Support Operations Manager - Acme Support',
      'Dec 2022 - Aug 2025',
      '- Led incident response and escalation handling across support operations.',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(1);
    expect(result.canonical.experience[0]).toMatchObject({
      company: 'Acme Support',
      role: 'Senior Support Operations Manager',
      start_date: 'Dec 2022',
      end_date: 'Aug 2025',
    });
  });

  it('recovers split header work history blocks where company and dates share one line and role follows on the next line', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA',
      '',
      'EXPERIENCE',
      'Acme Support October 2021 - March 2024',
      'Senior Support Operations Manager',
      '- Led incident response and escalation handling across support operations.',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(1);
    expect(result.canonical.experience[0]).toMatchObject({
      company: 'Acme Support',
      role: 'Senior Support Operations Manager',
      start_date: 'October 2021',
      end_date: 'March 2024',
    });
  });

  it('fails closed on malformed split blocks that still do not identify a safe company/role/date header', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA',
      '',
      'EXPERIENCE',
      '2021 - Present',
      '- Led incident response and escalation handling across support operations.',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(0);
    expect(result.canonical.system_generated_read_only.missing_fields).toEqual(
      expect.arrayContaining(['experience']),
    );
  });

  it('preserves line-oriented experience blocks from DOCX-style extraction into canonical ResumeV2 experience', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA | (555) 555-1234',
      '',
      'SUMMARY',
      'Support operations leader with verified impact across incident management, automation, and executive reporting.',
      '',
      'EXPERIENCE',
      'Acme Support | Senior Support Operations Manager | 2021 - Present',
      '- Led incident response for Sev1 and Sev2 outages and reduced escalation friction.',
      '',
      '- Built runbooks, routing automation, and reporting dashboards that improved SLA adherence and lowered MTTR.',
      '',
      'Beta Support | Support Operations Manager | 2018 - 2021',
      '- Owned support queue health, staffing tradeoffs, and recurring issue follow-up.',
      '',
      '- Improved reporting, routing, and workflow automation to reduce manual toil.',
      '',
      'SKILLS',
      'Jira Service Management, ServiceNow, incident response, automation',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(2);
    expect(result.trace?.extractedText?.textLength).toBeGreaterThan(0);
    expect(result.trace?.extractedText?.dateRangeCount).toBeGreaterThan(0);
    expect(result.trace?.parserOutput?.experienceSectionCount).toBeGreaterThan(0);
    expect(result.trace?.structuredBaselineExtractor?.candidateHeaderCount).toBeGreaterThan(0);
    expect(result.trace?.baselineIngestion?.candidateBlockCount).toBeGreaterThan(0);
    expect(result.trace?.baselineIngestion?.rejectionReasons ?? []).not.toContain('experience.date_range');
    expect(result.canonical.experience[0]).toMatchObject({
      company: 'Acme Support',
      role: 'Senior Support Operations Manager',
    });
    expect(result.canonical.experience[1]).toMatchObject({
      company: 'Beta Support',
      role: 'Support Operations Manager',
    });
    const evidenceTexts = result.canonical.experience
      .flatMap((entry) => entry.evidence.map((item) => item.text))
      .join(' | ');
    expect(evidenceTexts).not.toMatch(/alex\.candidate@example\.com|Seattle, WA|SUMMARY|SKILLS/i);
    expect(evidenceTexts).toContain('Led incident response for Sev1 and Sev2 outages');
    expect(evidenceTexts).toContain('Improved reporting, routing, and workflow automation');
    expect(evidenceTexts).not.toContain('Jira Service Management, ServiceNow, incident response, automation');
  });

  it('recovers structured experience from line-oriented extraction even when the parser does not emit an explicit Experience heading', async () => {
    const rawText = [
      'Alex Candidate',
      'alex.candidate@example.com | Seattle, WA | (555) 555-1234',
      '',
      'SUMMARY',
      'Support operations leader with verified impact across incident management, automation, and executive reporting.',
      '',
      'Acme Support | Senior Support Operations Manager | 2021 - Present',
      '- Led incident response for Sev1 and Sev2 outages and reduced escalation friction.',
      '',
      '- Built runbooks, routing automation, and reporting dashboards that improved SLA adherence and lowered MTTR.',
      '',
      'Beta Support | Support Operations Manager | 2018 - 2021',
      '- Owned support queue health, staffing tradeoffs, and recurring issue follow-up.',
      '',
      '- Improved reporting, routing, and workflow automation to reduce manual toil.',
      '',
      'SKILLS',
      'Jira Service Management, ServiceNow, incident response, automation',
    ].join('\n');

    const result = await service.ingestFromText(rawText, 'docx');

    expect(result.canonical.experience).toHaveLength(2);
    expect(result.canonical.experience[0]).toMatchObject({
      company: 'Acme Support',
      role: 'Senior Support Operations Manager',
    });
    expect(result.canonical.experience[1]).toMatchObject({
      company: 'Beta Support',
      role: 'Support Operations Manager',
    });
    const evidenceTexts = result.canonical.experience
      .flatMap((entry) => entry.evidence.map((item) => item.text))
      .join(' | ');
    expect(evidenceTexts).not.toMatch(/alex\.candidate@example\.com|Seattle, WA|SUMMARY|SKILLS/i);
    expect(evidenceTexts).toContain('Led incident response for Sev1 and Sev2 outages');
    expect(evidenceTexts).toContain('Improved reporting, routing, and workflow automation');
  });
});
