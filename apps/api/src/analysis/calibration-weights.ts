import { CalibrationWeights } from '../users/user.entity';

export type LegacyCalibrationWeights = {
  experienceAlignment: number;
  leadershipLevel: number;
  technicalPlatformFit: number;
  industryContext: number;
  strategicTacticalFit: number;
};

export const DEFAULT_LEGACY_CALIBRATION_WEIGHTS: LegacyCalibrationWeights = {
  experienceAlignment: 1,
  leadershipLevel: 1,
  technicalPlatformFit: 1,
  industryContext: 1,
  strategicTacticalFit: 1,
};

export function mapLegacyToCalibrationWeights(
  legacy: LegacyCalibrationWeights,
): CalibrationWeights {
  return {
    dimensionA: legacy.experienceAlignment,
    dimensionB: legacy.technicalPlatformFit,
    dimensionC: legacy.leadershipLevel,
    dimensionD: legacy.strategicTacticalFit,
    dimensionE: legacy.industryContext,
  };
}

export function mapCalibrationWeightsToLegacy(
  weights?: CalibrationWeights | null,
): LegacyCalibrationWeights {
  return {
    experienceAlignment: weights?.dimensionA ?? 1,
    leadershipLevel: weights?.dimensionC ?? 1,
    technicalPlatformFit: weights?.dimensionB ?? 1,
    industryContext: weights?.dimensionE ?? 1,
    strategicTacticalFit: weights?.dimensionD ?? 1,
  };
}

export function isLegacyCalibrationWeights(
  value: unknown,
): value is LegacyCalibrationWeights {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof LegacyCalibrationWeights, unknown>>;
  return (
    typeof candidate.experienceAlignment === 'number' &&
    typeof candidate.leadershipLevel === 'number' &&
    typeof candidate.technicalPlatformFit === 'number' &&
    typeof candidate.industryContext === 'number' &&
    typeof candidate.strategicTacticalFit === 'number'
  );
}

export function isCalibrationWeights(
  value: unknown,
): value is CalibrationWeights {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Record<keyof CalibrationWeights, unknown>>;
  return (
    typeof candidate.dimensionA === 'number' &&
    typeof candidate.dimensionB === 'number' &&
    typeof candidate.dimensionC === 'number' &&
    typeof candidate.dimensionD === 'number' &&
    typeof candidate.dimensionE === 'number'
  );
}
