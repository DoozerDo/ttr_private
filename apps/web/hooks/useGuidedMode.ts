"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NextActionType } from "@/lib/nextAction";

export type GuidedModeStatus = "active" | "completed";
export type GuidedStep = "START" | "ANALYZE" | "RESULTS" | "RESOLVE_GAPS" | "REANALYZE" | "GENERATE" | "COMPLETE";

export const GUIDED_MODE_KEY = "ttr-guided-mode";
export const GUIDED_STEP_KEY = "ttr-guided-step";

function isValidStep(value: string | null): value is GuidedStep {
  return value === "START" || value === "ANALYZE" || value === "RESULTS" || value === "RESOLVE_GAPS" || value === "REANALYZE" || value === "GENERATE" || value === "COMPLETE";
}

function readStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage as Storage | undefined;
  if (!storage || typeof storage.getItem !== "function") return null;
  return storage;
}

export function deriveGuidedStepFromNextAction(action: NextActionType): GuidedStep {
  if (action === "fit_review") return "RESOLVE_GAPS";
  if (action === "studio") return "GENERATE";
  if (action === "studio_with_save") return "GENERATE";
  return "COMPLETE";
}

export function useGuidedMode() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<GuidedModeStatus | null>(null);
  const [currentStep, setCurrentStep] = useState<GuidedStep>("START");

  useEffect(() => {
    const storage = readStorage();
    const force = searchParams.get("guided")?.trim();
    if (!storage) {
      if (force === "0") {
        setMode("completed");
        setCurrentStep("COMPLETE");
        return;
      }
      setMode("active");
      setCurrentStep("START");
      return;
    }

    if (force === "0") {
      if (typeof storage.setItem === "function") storage.setItem(GUIDED_MODE_KEY, "completed");
      if (typeof storage.removeItem === "function") storage.removeItem(GUIDED_STEP_KEY);
      setMode("completed");
      setCurrentStep("COMPLETE");
      return;
    }
    if (force === "1") {
      if (typeof storage.setItem === "function") storage.setItem(GUIDED_MODE_KEY, "active");
      const step = storage.getItem(GUIDED_STEP_KEY);
      const nextStep = isValidStep(step) ? step : "START";
      if (!isValidStep(step) && typeof storage.setItem === "function") storage.setItem(GUIDED_STEP_KEY, nextStep);
      setMode("active");
      setCurrentStep(nextStep);
      return;
    }

    const storedMode = storage.getItem(GUIDED_MODE_KEY);
    if (storedMode === "completed") {
      setMode("completed");
      setCurrentStep("COMPLETE");
      return;
    }

    if (typeof storage.setItem === "function") storage.setItem(GUIDED_MODE_KEY, "active");
    const step = storage.getItem(GUIDED_STEP_KEY);
    const nextStep = isValidStep(step) ? step : "START";
    if (!isValidStep(step) && typeof storage.setItem === "function") storage.setItem(GUIDED_STEP_KEY, nextStep);
    setMode("active");
    setCurrentStep(nextStep);
  }, [searchParams]);

  const isGuidedActive = mode === "active";

  const setStep = useCallback((step: GuidedStep) => {
    const storage = readStorage();
    if (!storage) return;
    if (typeof storage.setItem === "function") storage.setItem(GUIDED_STEP_KEY, step);
    setCurrentStep(step);
  }, []);

  const advanceStep = useCallback((nextStep?: GuidedStep) => {
    if (!isGuidedActive) return;
    if (nextStep) {
      setStep(nextStep);
      return;
    }
    const order: GuidedStep[] = ["START", "ANALYZE", "RESULTS", "RESOLVE_GAPS", "REANALYZE", "GENERATE", "COMPLETE"];
    const currentIndex = order.indexOf(currentStep);
    const target = currentIndex >= 0 && currentIndex < order.length - 1 ? order[currentIndex + 1] : "COMPLETE";
    setStep(target);
  }, [currentStep, isGuidedActive, setStep]);

  const syncWithNextAction = useCallback((action: NextActionType) => {
    if (!isGuidedActive) return;
    const derivedStep = deriveGuidedStepFromNextAction(action);
    if (derivedStep === "COMPLETE") {
      const storage = readStorage();
      if (!storage) return;
      if (typeof storage.setItem === "function") storage.setItem(GUIDED_MODE_KEY, "completed");
      if (typeof storage.removeItem === "function") storage.removeItem(GUIDED_STEP_KEY);
      setMode("completed");
      setCurrentStep("COMPLETE");
      return;
    }
    setStep(derivedStep);
  }, [isGuidedActive, setStep]);

  const completeGuidedMode = useCallback(() => {
    const storage = readStorage();
    if (!storage) return;
    if (typeof storage.setItem === "function") storage.setItem(GUIDED_MODE_KEY, "completed");
    if (typeof storage.removeItem === "function") storage.removeItem(GUIDED_STEP_KEY);
    setMode("completed");
    setCurrentStep("COMPLETE");
  }, []);

  return useMemo(
    () => ({
      isGuidedActive,
      currentStep,
      advanceStep,
      completeGuidedMode,
      syncWithNextAction,
    }),
    [advanceStep, completeGuidedMode, currentStep, isGuidedActive, syncWithNextAction],
  );
}
