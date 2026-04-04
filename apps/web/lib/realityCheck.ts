"use client";

import { ApiResponseError, apiFetchJson } from "@/app/(app)/lib/api";

export type RealityCheckQuestionType = "boolean" | "single_select" | "multi_select";

export type RealityCheckQuestionOption = {
  value: string;
  label: string;
};

export type RealityCheckQuestion = {
  id: string;
  type: RealityCheckQuestionType;
  prompt: string;
  options?: RealityCheckQuestionOption[];
  mapsToSections: string[];
  gatingTag?: string;
};

export type RealityCheckAnswerValue = boolean | string | string[];

export type RealityCheckAnswer = {
  questionId: string;
  type: RealityCheckQuestionType;
  value: RealityCheckAnswerValue;
};

export enum RealityCheckOutcome {
  VALID = "valid",
  UPDATE_RECOMMENDED = "update_recommended",
  MISMATCH = "mismatch",
}

export type RealityCheckDto = {
  id: string;
  jobId: string;
  baselineId: string;
  triggeredBy: string[];
  questions: RealityCheckQuestion[];
  answers: RealityCheckAnswer[];
  outcome: RealityCheckOutcome;
  baselineUpdateSuggested: boolean;
  suggestedBaselineSections: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};

export async function getRealityCheck(
  jobId: string,
  baselineId: string,
): Promise<RealityCheckDto | null> {
  try {
    return await apiFetchJson<RealityCheckDto>(
      `/api/reality-check?jobId=${encodeURIComponent(jobId)}&baselineId=${encodeURIComponent(
        baselineId,
      )}`,
    );
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function generateRealityCheckQuestions(
  jobId: string,
  baselineId: string,
): Promise<{ questions: RealityCheckQuestion[] }> {
  return apiFetchJson<{ questions: RealityCheckQuestion[] }>("/api/reality-check/questions", {
    method: "POST",
    body: JSON.stringify({ jobId, baselineId }),
  });
}

export async function submitRealityCheck(
  jobId: string,
  baselineId: string,
  answers: RealityCheckAnswer[],
): Promise<RealityCheckDto> {
  return apiFetchJson<RealityCheckDto>("/api/reality-check", {
    method: "POST",
    body: JSON.stringify({ jobId, baselineId, answers }),
  });
}
