export type ArtifactTraceAudit = {
  traceMap: Record<string, string[]>;
  debugTrace: {
    passed: boolean;
    failures: string[];
    traceCoverage: number;
    unusedEvidence: string[];
    selectedEvidence: string[];
  };
};

export type ArtifactTraceLine = {
  id: string;
  text: string;
  sourceEvidenceIds?: string[];
};
