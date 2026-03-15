"use client";

import { BaselineStrengthCard } from "@/src/features/baseline/components/BaselineStrengthCard";

type BaselineUnlockProgressProps = {
  progressPercent: number;
  milestoneLabel: string;
  isBaselineReady: boolean;
  onContinue: () => void;
  onRunAnalysis?: () => void;
};

export function BaselineUnlockProgress({
  progressPercent,
  milestoneLabel: _milestoneLabel,
  isBaselineReady: _isBaselineReady,
  onContinue,
  onRunAnalysis,
}: BaselineUnlockProgressProps) {
  return (
    <BaselineStrengthCard
      progressPercent={progressPercent}
      onContinue={onContinue}
      onRunAnalysis={onRunAnalysis}
    />
  );
}
