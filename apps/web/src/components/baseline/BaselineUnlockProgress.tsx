"use client";

import { BaselineStrengthCard } from "@/src/features/baseline/components/BaselineStrengthCard";

type BaselineUnlockProgressProps = {
  progressPercent: number;
  analysisStatus: "NOT_ANALYZED" | "ANALYZING" | "READY";
  isIncomplete: boolean;
  milestoneLabel: string;
  isBaselineReady: boolean;
  onContinue: () => void;
  onRunAnalysis?: () => void;
  onAddJobDescription?: () => void;
};

export function BaselineUnlockProgress({
  progressPercent,
  analysisStatus,
  isIncomplete,
  milestoneLabel: _milestoneLabel,
  isBaselineReady: _isBaselineReady,
  onContinue,
  onRunAnalysis,
  onAddJobDescription,
}: BaselineUnlockProgressProps) {
  return (
    <BaselineStrengthCard
      progressPercent={progressPercent}
      analysisStatus={analysisStatus}
      isIncomplete={isIncomplete}
      onContinue={onContinue}
      onRunAnalysis={onRunAnalysis}
      onAddJobDescription={onAddJobDescription}
    />
  );
}
