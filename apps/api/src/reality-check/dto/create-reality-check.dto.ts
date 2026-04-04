import { RealityCheckAnswerInput } from '../reality-check.types';

export class CreateRealityCheckDto {
  jobId!: string;
  baselineId!: string;
  answers!: RealityCheckAnswerInput[];
}
