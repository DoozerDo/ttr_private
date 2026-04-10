import JSZip from 'jszip';
import { buildNormalizedResumeDocument, validateNormalizedResumeDocument } from '../resume/resume-normalization';
import { buildResumeDraftSections } from '../resume/resume-draft-bullets';
import { listSyntheticGenerationScenarioBundles } from '../synthetic/generation/synthetic-generation.fixtures';
import {
  loadSyntheticLoopBaselineFixture,
  SYNTHETIC_LOOP_BASELINE_FILENAME,
  SYNTHETIC_LOOP_BASELINE_MIME_TYPE,
} from './synthetic-loop-fixture';

describe('synthetic loop baseline fixture', () => {
  it('builds a scenario-specific DOCX fixture with the expected upload contract', async () => {
    const bundle = listSyntheticGenerationScenarioBundles().find(
      (entry) => entry.scenario.id === 'support-ops-director-strong-fit',
    );
    expect(bundle).toBeDefined();

    const fixture = await loadSyntheticLoopBaselineFixture(bundle!);

    expect(fixture.filename).toBe(SYNTHETIC_LOOP_BASELINE_FILENAME);
    expect(fixture.mimetype).toBe(SYNTHETIC_LOOP_BASELINE_MIME_TYPE);
    expect(fixture.buffer.byteLength).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(fixture.buffer);
    const documentXml = await zip.file('word/document.xml')?.async('text');
    expect(documentXml).toBeDefined();
    expect(documentXml!).toContain('Morgan Lee');
    expect(documentXml!).toContain('Summary');
    expect(documentXml!).toContain('Experience');
    expect(documentXml!).toContain('Technical Skills');
    expect(documentXml!).toContain('Example SaaS | Support Operations Director | 2019 - 2022');
    expect(documentXml!).toContain('Example SaaS | Support Operations Program Owner | 2024 - Present');
    expect(documentXml!).toContain('queue health');
    expect(documentXml!).toContain('staffing tradeoffs');
    expect(documentXml!).toContain('Zendesk | Jira | Salesforce Service Cloud | SQL | Looker');
    expect(documentXml!).toContain('capacity planning');
    expect(documentXml!).toContain('2019 - 2022');
    expect(documentXml!).toContain('2024 - Present');

    const draftedSections = buildResumeDraftSections(bundle!.baseline.sections as any, {
      jobText: bundle!.job.rawDescription,
    });
    const experienceSections = draftedSections.filter(
      (section) => String(section.type ?? '').toUpperCase() === 'EXPERIENCE',
    );
    expect(experienceSections.length).toBeGreaterThan(0);
    expect(experienceSections.every((section) => section.bullets.length > 0)).toBe(true);

    const normalized = buildNormalizedResumeDocument(draftedSections as any, {
      fullName: 'Morgan Lee',
    } as any);
    const validation = validateNormalizedResumeDocument(normalized);
    expect(validation.valid).toBe(true);
    expect(normalized.experience.length).toBeGreaterThan(0);
    expect(normalized.experience.some((entry) => entry.company.includes('Example SaaS'))).toBe(true);

    expect(bundle!.scenario.expected.generationMode).toBe('generate');
    expect(bundle!.scenario.expected.journey).toEqual({
      results: 'review',
      studio: 'open',
      opportunity: 'save',
    });
  });
});
