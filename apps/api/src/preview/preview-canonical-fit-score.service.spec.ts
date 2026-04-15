import { describe, expect, it } from '@jest/globals';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { scoreCxFitV2 } from '../analysis/cx-fit-scoring-v2';
import { normalizeJobDescription } from '../analysis/job-normalizer';
import { PreviewCanonicalFitScoreService } from './preview-canonical-fit-score.service';

describe('PreviewCanonicalFitScoreService', () => {
  it('matches scoreCxFitV2 for the same normalized inputs', () => {
    const gapAnalysisService = new GapAnalysisService();
    const service = new PreviewCanonicalFitScoreService(gapAnalysisService);

    const resumeText =
      'Director of Customer Support. Led Zendesk operations, Salesforce Service Cloud workflows, SLA management, incident communications.';
    const jobDescriptionText =
      'Director of Customer Support. Responsibilities: own SLA improvements, lead support ops, manage escalations. Requirements: Zendesk, Salesforce, incident response.';

    const result = service.compute({ resumeText, jobDescriptionText });

    const normalized = normalizeJobDescription(jobDescriptionText).normalized;
    const validatedRequirements = gapAnalysisService.validateRequirements(
      normalized.requirements,
    );

    const direct = scoreCxFitV2(
      {
        job: {
          rawDescription: jobDescriptionText,
          normalizedResponsibilities: normalized.responsibilities,
          normalizedRequirements: validatedRequirements,
        },
        normalizedJobResponsibilities: normalized.responsibilities,
        normalizedJobRequirements: validatedRequirements,
        baselineSections: [{ type: 'RAW', content: resumeText }],
      },
      { debugBundle: false },
    );

    expect(result.score).toBe(direct.score);
    expect(result.contractVersion).toBe('cx_fit_v2_scoring_contract_v1');
    expect(['TOP', 'MID', 'LOW']).toContain(result.scoreBand);
    expect(['Apply', 'Consider', 'Skip']).toContain(result.verdict);
  });
});

