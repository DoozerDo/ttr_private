import { listSyntheticGenerationScenarioBundles } from '../synthetic/generation/synthetic-generation.fixtures';
import { buildSyntheticLoopJobDescription } from './synthetic-loop-job-description';

describe('synthetic loop job description', () => {
  it('builds a long, realistic strong-fit job description for the canonical support ops scenario', () => {
    const bundle = listSyntheticGenerationScenarioBundles().find(
      (entry) => entry.scenario.id === 'support-ops-director-strong-fit',
    );

    expect(bundle).toBeTruthy();
    const { text, wordCount } = buildSyntheticLoopJobDescription(bundle!, 'run-test-001');

    expect(wordCount).toBeGreaterThanOrEqual(300);
    expect(text.toLowerCase()).toContain('support operations');
    expect(text).toContain('Zendesk');
    expect(text).toContain('problem management');
    expect(text).toContain('incident command');
    expect(text).toContain('run-test-001');
  });
});
