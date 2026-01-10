export type RealityCheckQuestionType = 'boolean' | 'single_select' | 'multi_select';

export type RealityCheckQuestionOption = {
  value: string;
  label: string;
};

export type RealityCheckQuestion = {
  id: string;
  type: RealityCheckQuestionType;
  prompt: string;
  options?: RealityCheckQuestionOption[];
  mapsToSections: string[];
  gatingTag?: string;
};

export type RealityCheckAnswerValue = boolean | string | string[];

export type RealityCheckAnswer = {
  questionId: string;
  type: RealityCheckQuestionType;
  value: RealityCheckAnswerValue;
};

export type RealityCheckAnswerInput = RealityCheckAnswer;

export enum RealityCheckOutcome {
  VALID = 'valid',
  UPDATE_RECOMMENDED = 'update_recommended',
  MISMATCH = 'mismatch',
}
