import { Injectable } from '@nestjs/common';
import { scoreCxFitV2 } from '../analysis/cx-fit-scoring-v2';
import { normalizeJobDescription } from '../analysis/job-normalizer';
import { GapAnalysisService } from '../analysis/gap-analysis.service';

/**
 * AUTHORITY BYPASS (intentional): Public canonical-fit-score preview.
 *
 * This endpoint is intentionally constrained:
 * - Uses raw resume text + raw job description text (no baseline selection, no persistence).
 * - Does NOT run compliance/audit flows (those are part of authenticated orchestration).
 *
 * Rationale:
 * - Public marketing/landing flow needs a fast, stateless score estimate.
 *
 * Guardrail:
 * - Do not expand this into an authenticated scoring path. Authenticated scoring must flow through
 *   `AnalysisController` → `AnalysisService` so scoring/audit semantics remain canonical.
 */
export type CanonicalFitScoreResponse = {
  score: number;
  scoreBand: 'TOP' | 'MID' | 'LOW';
  verdict: 'Apply' | 'Consider' | 'Skip';
  strengths: string[];
  gaps: string[];
  contractVersion: 'cx_fit_v2_scoring_contract_v1';
};

function scoreBandFromScore(score: number): 'TOP' | 'MID' | 'LOW' {
  if (score >= 90) return 'TOP';
  if (score >= 70) return 'MID';
  return 'LOW';
}

function verdictFromScore(score: number): 'Apply' | 'Consider' | 'Skip' {
  if (score >= 85) return 'Apply';
  if (score >= 70) return 'Consider';
  return 'Skip';
}

@Injectable()
export class PreviewCanonicalFitScoreService {
  constructor(private readonly gapAnalysisService: GapAnalysisService) {}

  compute(input: {
    resumeText: string;
    jobDescriptionText: string;
  }): CanonicalFitScoreResponse {
    const resumeText = (input.resumeText ?? '').trim();
    const jobDescriptionText = (input.jobDescriptionText ?? '').trim();

    const { normalized } = normalizeJobDescription(jobDescriptionText);
    const validatedRequirements = this.gapAnalysisService.validateRequirements(
      normalized.requirements,
    );

    const baselineSections = resumeText.length
      ? [{ type: 'RAW', content: resumeText }]
      : [];

    const scoringV2 = scoreCxFitV2(
      {
        job: {
          rawDescription: jobDescriptionText,
          normalizedResponsibilities: normalized.responsibilities,
          normalizedRequirements: validatedRequirements,
        },
        normalizedJobResponsibilities: normalized.responsibilities,
        normalizedJobRequirements: validatedRequirements,
        baselineSections,
      },
      { debugBundle: false },
    );

    const score = scoringV2.score;
    const gapInsights = this.gapAnalysisService.analyze({
      baselineSections,
      validatedRequirements,
      dimensionPercents: scoringV2.rubric.dimensionPercents,
      debugMatching: false,
    });

    return {
      score,
      scoreBand: scoreBandFromScore(score),
      verdict: verdictFromScore(score),
      strengths: gapInsights.strengths.slice(0, 5),
      gaps: gapInsights.criticalGaps.map((gap) => gap.title).slice(0, 5),
      contractVersion: 'cx_fit_v2_scoring_contract_v1',
    };
  }
}
