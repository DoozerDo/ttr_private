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
      skills: ['SQL', 'Python'],
      missingEvidenceReasons: [],
    } as any);

    expect(readiness.canGenerateResume).toBe(true);
    expect(readiness.canGenerateCoverLetter).toBe(true);
    expect(readiness.hardBlockReasons).toEqual([]);
    expect(['strong', 'usable', 'insufficient']).toContain(readiness.evidence.threshold);
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

  it('does not block strong hybrid baselines with legal suffix punctuation (Dalen-style)', () => {
    const readiness = evaluateBaselineTemplateReadiness({
      summary: 'Hybrid engineer with software, infrastructure, and lab experience.',
      skills: ['Python', 'Docker', 'Kubernetes', 'Ansible', 'Terraform', 'DNS'],
      experience: [
        {
          company: 'Of Fates Games LLC',
          roleTitle: 'Technical Architect & Full-Stack Engineer',
          bullets: ['Built Nuxt 3 frontend and API layer.'],
          source: 'baseline',
        },
        {
          company: 'AMS DataSerfs, Inc.',
          roleTitle: 'Linux System Administrator',
          bullets: ['Managed Linux systems and automated provisioning.'],
          source: 'baseline',
        },
      ],
      education: [],
      missingEvidenceReasons: [],
    } as any);

    expect(readiness.canGenerateResume).toBe(true);
    expect(readiness.canGenerateCoverLetter).toBe(true);
    expect(readiness.hardBlockReasons).toEqual([]);
    expect(readiness.stats.validExperience).toBeGreaterThan(0);
  });
});
