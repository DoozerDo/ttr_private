export type GenerationValidationResult = {
  passed: boolean;
  failures: string[];
  traceCoverage: number;
  unusedEvidence: string[];
  selectedEvidence: string[];
};

export type TracedLine = {
  id: string;
  text: string;
  sourceEvidenceIds?: string[];
};

export function validateGenerationTrace(
  lines: TracedLine[],
  availableEvidenceIds: string[],
): GenerationValidationResult {
  const failures: string[] = [];
  const selectedEvidence = new Set<string>();
  const usedEvidence = new Set<string>();

  for (const line of lines) {
    const ids = (line.sourceEvidenceIds ?? []).filter(Boolean);
    if (ids.length === 0) {
      failures.push(`Line ${line.id} has no source evidence.`);
      continue;
    }
    if (new Set(ids).size !== ids.length) {
      failures.push(`Line ${line.id} has ambiguous evidence mapping.`);
    }
    ids.forEach((id) => {
      usedEvidence.add(id);
      selectedEvidence.add(id);
    });
  }

  const available = new Set(availableEvidenceIds.filter(Boolean));
  for (const id of usedEvidence) {
    if (!available.has(id)) {
      failures.push(`Referenced evidence ${id} is not part of the available baseline evidence.`);
    }
  }

  const traceCoverage =
    available.size === 0
      ? 100
      : Math.round((usedEvidence.size / available.size) * 100);

  return {
    passed: failures.length === 0,
    failures,
    traceCoverage,
    unusedEvidence: [...available].filter((id) => !usedEvidence.has(id)),
    selectedEvidence: [...selectedEvidence],
  };
}
