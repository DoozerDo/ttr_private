export type CalibrationProfile = 'balanced' | 'conservative' | 'aggressive';

type CalibrationWeights = {
  experienceAlignment: number;
  leadershipLevel: number;
  technicalPlatformFit: number;
  industryContext: number;
  strategicTacticalFit: number;
};

type CalibrationProfileOption = {
  value: CalibrationProfile;
  label: string;
  description: string;
  weights: CalibrationWeights;
};

export const CALIBRATION_PROFILE_OPTIONS: Array<CalibrationProfileOption> = [
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Even weighting across all dimensions for a steady baseline.',
    weights: {
      experienceAlignment: 1,
      leadershipLevel: 1,
      technicalPlatformFit: 1,
      industryContext: 1,
      strategicTacticalFit: 1,
    },
  },
  {
    value: 'conservative',
    label: 'Conservative',
    description: 'Boosts experience and leadership signals for a higher bar.',
    weights: {
      experienceAlignment: 1.2,
      leadershipLevel: 1.2,
      technicalPlatformFit: 0.8,
      industryContext: 1,
      strategicTacticalFit: 0.8,
    },
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    description: 'Rewards strategic and platform signals to broaden reach.',
    weights: {
      experienceAlignment: 0.9,
      leadershipLevel: 0.9,
      technicalPlatformFit: 1.3,
      industryContext: 1.1,
      strategicTacticalFit: 1.3,
    },
  },
];
