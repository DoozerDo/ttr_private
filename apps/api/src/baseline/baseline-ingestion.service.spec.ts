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
