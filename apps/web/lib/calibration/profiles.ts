export type CalibrationProfile = 'balanced' | 'conservative' | 'aggressive';

export const CALIBRATION_PROFILE_OPTIONS: Array<{
  value: CalibrationProfile;
  label: string;
  description: string;
}> = [
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Even weighting across all dimensions for a steady baseline.',
  },
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Boosts experience and leadership signals for a higher bar.',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Rewards strategic and platform signals to broaden reach.',
  },
];
