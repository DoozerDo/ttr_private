import { describe, expect, it } from '@jest/globals';
import { evaluateBaselineTemplateReadiness } from './baselineTemplateReadiness';

describe('baselineTemplateReadiness', () => {
  it('accepts template-safe experience headers', () => {
    const readiness = evaluateBaselineTemplateReadiness({
      summary: 'x',
      experience: [
        {
          company: 'AMS DataSerfs',
          roleTitle: 'Senior Data Analyst',
          bullets: ['Did work.'],
          source: 'baseline',
        },
      ],
      education: [],
      skills: [],
      missingEvidenceReasons: [],
    } as any);

    expect(readiness.canGenerateResume).toBe(true);
    expect(readiness.canGenerateCoverLetter).toBe(true);
    expect(readiness.hardBlockReasons).toEqual([]);
  });

  it('blocks template generation when only malformed fragments exist', () => {
    const readiness = evaluateBaselineTemplateReadiness({
      summary: 'x',
      experience: [
        {
          company: 'Vue 3), deck builder frontend',
          roleTitle: 'Project',
          bullets: ['x'],
          source: 'baseline',
        },
      ],
      education: [],
      skills: [],
      missingEvidenceReasons: ['missing_experience_headers'],
    } as any);

    expect(readiness.canGenerateResume).toBe(false);
    expect(readiness.canGenerateCoverLetter).toBe(false);
    expect(readiness.hardBlockReasons[0]?.code).toBe('baseline_template_not_ready');
    expect(readiness.stats.validExperience).toBe(0);
  });
});
