import { CalibrationWeights } from '../../users/user.entity';

export class CalibrationDto {
  profileName!: string;

  weights!: CalibrationWeights;
}
