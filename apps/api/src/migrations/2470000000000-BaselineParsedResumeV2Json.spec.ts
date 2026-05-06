import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Migration: BaselineParsed resumeV2Json', () => {
  it('adds resumeV2Json column to baseline_parsed', () => {
    const file = path.join(__dirname, '2470000000000-BaselineParsedResumeV2Json.ts');
    const content = readFileSync(file, 'utf8');
    expect(content).toMatch(/ALTER TABLE \"baseline_parsed\"/);
    expect(content).toMatch(/\"resumeV2Json\" jsonb/i);
  });
});

