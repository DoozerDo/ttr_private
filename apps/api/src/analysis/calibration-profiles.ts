import type { CalibrationWeights } from '../users/user.entity';

export type CalibrationProfile = 'balanced' | 'conservative' | 'aggressive';

export const CALIBRATION_PROFILES: Record<
  CalibrationProfile,
  { label: string; weights: CalibrationWeights }
> = {
  balanced: {
    label: 'Balanced',
    weights: {
      dimensionA: 1,
      dimensionB: 1,
      dimensionC: 1,
      dimensionD: 1,
      dimensionE: 1,
    },
  },
  conservative: {
    label: 'Conservative',
    weights: {
      dimensionA: 1.15,
      dimensionB: 0.95,
      dimensionC: 1.2,
      dimensionD: 0.95,
      dimensionE: 0.9,
    },
  },
  aggressive: {
    label: 'Aggressive',
    weights: {
      dimensionA: 0.9,
      dimensionB: 1.1,
      dimensionC: 0.85,
      dimensionD: 1.2,
      dimensionE: 1.05,
    },
  },
};
