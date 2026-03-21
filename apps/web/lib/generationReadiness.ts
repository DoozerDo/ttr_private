export type GenerationReadiness = {
  blocked: boolean;
  reasonCodes: string[];
};

const hasBlockerSeverity = (flag: unknown): boolean => {
  if (!flag || typeof flag !== "object") return false;
  const typed = flag as {
    severity?: unknown;
    level?: unknown;
    status?: unknown;
  };
  const candidates = [typed.severity, typed.level, typed.status]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  return candidates.some((value) => value.includes("block"));
};

export function getGenerationReadiness(
  result: unknown,
  runState: "ok" | "compliance_blocked" | null,
): GenerationReadiness {
  const reasonCodes: string[] = [];

  if (runState === "compliance_blocked") {
    reasonCodes.push("run_state_blocked");
  }

  if (result && typeof result === "object") {
    const typed = result as {
      verdict?: unknown;
      compliance?: { blocked?: unknown };
      complianceFlags?: unknown;
      compliance_flags?: unknown;
    };

    if (typed.verdict === "blocked") {
      reasonCodes.push("verdict_blocked");
    }

    if (typed.compliance?.blocked === true) {
      reasonCodes.push("compliance_blocked_flag");
    }

    const flags = [
      ...(Array.isArray(typed.complianceFlags) ? typed.complianceFlags : []),
      ...(Array.isArray(typed.compliance_flags) ? typed.compliance_flags : []),
    ];

    if (flags.some((flag) => hasBlockerSeverity(flag))) {
      reasonCodes.push("severity_blocker");
    }
  }

  return {
    blocked: reasonCodes.length > 0,
    reasonCodes,
  };
}
