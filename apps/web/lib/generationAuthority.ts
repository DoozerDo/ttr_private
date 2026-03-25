import type { GenerationReadiness } from "@/lib/generationReadiness";

export type GenerationAuthorityState = "READY" | "LIMITED" | "BLOCKED";

export function getGenerationAuthorityState(
  readiness: GenerationReadiness | null | undefined,
): GenerationAuthorityState {
  if (!readiness) return "BLOCKED";
  if (readiness.status === "ready") return "READY";
  if (readiness.blocked || readiness.status === "blocked") return "BLOCKED";
  return "LIMITED";
}

