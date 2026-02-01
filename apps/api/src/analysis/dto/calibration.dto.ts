import { CalibrationWeights } from '../../users/user.entity';
import type { LegacyCalibrationWeights } from '../calibration-weights';

export class CalibrationDto {
  profileName!: string;

  weights!: LegacyCalibrationWeights | CalibrationWeights;

  assessmentId?: string;
}
