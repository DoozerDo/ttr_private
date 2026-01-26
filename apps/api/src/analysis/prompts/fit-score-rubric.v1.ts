export const FIT_SCORE_RUBRIC_VERSION = 'v1' as const;

export type FitScoreRubricMessages = {
  system: string;
  developer: string;
  user: string;
};

export type FitScoreRubricDimensions = {
  experience: number;
  leadership: number;
  technicalPlatform: number;
  industryContext: number;
  strategicBalance: number;
};

export type FitScoreRubricVerdict =
  | 'Strong'
  | 'Moderate'
  | 'Borderline'
  | 'Skip';

export type FitScoreRubricJson = {
  scoringPromptVersion: typeof FIT_SCORE_RUBRIC_VERSION;
  score: number;
  verdict: FitScoreRubricVerdict;
  dimensionScores: FitScoreRubricDimensions;
  notes: string;
};

const schemaDescription = `{
  "scoringPromptVersion": "v1",
  "score": <number 0-100>,
  "verdict": "Strong|Moderate|Borderline|Skip",
  "dimensionScores": {
    "experience": <number 0-100>,
    "leadership": <number 0-100>,
    "technicalPlatform": <number 0-100>,
    "industryContext": <number 0-100>,
    "strategicBalance": <number 0-100>
  },
  "notes": "<string>"
}`;

export function buildFitScoreRubricMessages(options: {
  baselineText: string;
  jobText: string;
}): FitScoreRubricMessages {
  const user = [
    'Provide only JSON text that matches the schema shown below exactly.',
    'Do not wrap the output in markdown or include commentary.',
    'Do not add extra keys or remove any keys from the schema.',
    'Schema:',
    schemaDescription,
    '',
    'Baseline Text:',
    options.baselineText,
    '',
    'Job Text:',
    options.jobText,
  ].join('\n');

  return {
    system:
      'You are a scoring assistant that evaluates job descriptions against a baseline using a rubric.',
    developer:
      'Identify how well the job description matches the baseline and score contextual fit for experience, leadership, technical platform, industry context, and strategic balance.',
    user,
  };
}
