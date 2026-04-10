import { buildDocumentStrategyPlan } from '../shared/documentStrategyPlan';
import { listSyntheticGenerationScenarioBundles } from './generation/synthetic-generation.fixtures';

describe('synthetic loop document strategy plan', () => {
  it('builds a generation-ready plan for the canonical strong-fit support ops scenario', () => {
    const bundle = listSyntheticGenerationScenarioBundles().find(
      (entry) => entry.scenario.id === 'support-ops-director-strong-fit',
    );
    expect(bundle).toBeDefined();

    const plan = buildDocumentStrategyPlan({
      fitScore: 92,
      jobTitle: bundle!.job.title,
      jobCompany: bundle!.job.company,
      jobDescription: bundle!.job.rawDescription,
      jobRequirements: bundle!.job.normalizedRequirements,
      jobResponsibilities: bundle!.job.normalizedResponsibilities,
      analysisSummary: 'Strong support operations alignment.',
      analysisStrengths: bundle!.scenario.expected.requiredRoleSignals.slice(0, 3),
      analysisGaps: [],
      analysisRecommendedActions: [],
      baselineSections: bundle!.baseline.sections,
    });

    expect(plan.fitScore).toBe(92);
    expect(plan.fitBand).toBe('strong');
    expect(plan.positioningFrame).toBeTruthy();
    expect(plan.selectedEvidence.length).toBeGreaterThan(0);
    expect(plan.qualityPass.coverLetterDelta.length).toBeGreaterThan(0);
    expect(plan.qualityPass.coverLetterDelta.join(' ')).not.toMatch(
      /Matched \d+ of \d+ key terms from the job description/i,
    );
    expect(plan.coverLetterThemes.length).toBeGreaterThan(0);
  });
});
