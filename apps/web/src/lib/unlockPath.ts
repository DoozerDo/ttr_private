import { resolveWorkflowAuthorityContract } from "@/lib/workflowAuthorityContract";

export type UnlockPathModuleState = "LOCKED" | "CURRENT" | "UNLOCKED" | "COMPLETE";

export type UnlockPathResolvedState = {
  baseline: UnlockPathModuleState;
  analysis: UnlockPathModuleState;
  fitReview: UnlockPathModuleState;
  studio: UnlockPathModuleState;
  opportunities: "LOCKED" | "UNLOCKED" | "CURRENT";
};

export type UnlockPathInput = {
  currentPathname?: string;
  baselineReady: boolean;
  analysisExists: boolean;
  score: number | null;
  readinessStatus?: "ready" | "limited" | "blocked" | null;
  readinessReasonCodes?: string[] | null;
  hasGeneratedDocuments: boolean;
  hasSavedOpportunity?: boolean;
};

export type UnlockPathModuleKey = "baseline" | "analysis" | "fitReview" | "studio" | "opportunities";

function matchesPath(pathname: string | undefined, prefix: string): boolean {
  if (!pathname) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveUnlockPathState(input: UnlockPathInput): UnlockPathResolvedState {
  const readinessStatus = input.readinessStatus ?? null;
  const readinessReasonCodes = Array.isArray(input.readinessReasonCodes)
    ? input.readinessReasonCodes.filter((c): c is string => typeof c === "string")
    : [];
  const contract = resolveWorkflowAuthorityContract({
    surface: "app_shell",
    currentPathname: input.currentPathname ?? null,
    baselineReady: input.baselineReady,
    analysisExists: input.analysisExists,
    score: input.score ?? null,
    generationReadiness: readinessStatus
      ? { status: readinessStatus, blocked: readinessStatus === "blocked", reasonCodes: readinessReasonCodes }
      : null,
    artifact: {
      // Stepper only needs a coarse document state.
      resume: { hasOutput: Boolean(input.hasGeneratedDocuments), failed: false, status: input.hasGeneratedDocuments ? "completed" : null },
      coverLetter: { hasOutput: Boolean(input.hasGeneratedDocuments), failed: false, status: input.hasGeneratedDocuments ? "completed" : null },
      pair: { status: input.hasGeneratedDocuments ? "completed" : null, generating: false, failure: null },
    },
    opportunity: { hasSavedOpportunity: Boolean(input.hasSavedOpportunity), materialsGenerated: Boolean(input.hasGeneratedDocuments) },
  });

  function mapState(value: typeof contract.stepper.baseline): UnlockPathModuleState {
    if (value === "locked") return "LOCKED";
    if (value === "current") return "CURRENT";
    if (value === "complete") return "COMPLETE";
    return "UNLOCKED";
  }

  return {
    baseline: mapState(contract.stepper.baseline),
    analysis: mapState(contract.stepper.analysis),
    fitReview: mapState(contract.stepper.fitReview),
    studio: mapState(contract.stepper.studio),
    opportunities: contract.stepper.opportunities === "locked" ? "LOCKED" : contract.stepper.opportunities === "current" ? "CURRENT" : "UNLOCKED",
  };
}
