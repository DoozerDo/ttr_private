export type ArtifactTraceAudit = {
  traceMap: Record<string, string[]>;
  // Phase 5.5 foundation: optional mapping from evidence ids to interpreted evidence metadata.
  // Generators may omit this until they support interpreted evidence units.
  evidenceDetailsMap?: Record<
    string,
    Array<{
      evidenceItemId: string;
      evidenceStrength?: 'strong' | 'partial' | 'weak' | 'unusable';
      evidenceSource?: 'explicit' | 'inferred_from_resume_text';
      supportLevel?: 'direct' | 'partial' | 'contextual' | 'none';
      generationUse?: 'use_directly' | 'use_with_constraints' | 'positioning_only' | 'do_not_use';
      constraintsApplied?: string[];
      missingElements?: Array<
        | 'metrics'
        | 'scope'
        | 'outcome'
        | 'tools'
        | 'leadership_context'
        | 'customer_context'
        | 'timeframe'
      >;
    }>
  >;
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
  // Phase 4 foundation: allow interpreted-evidence metadata to be threaded through audit structures
  // without changing generator behavior yet.
  sourceEvidenceDetails?: Array<{
    evidenceItemId: string;
    evidenceStrength?: 'strong' | 'partial' | 'weak' | 'unusable';
    evidenceSource?: 'explicit' | 'inferred_from_resume_text';
    supportLevel?: 'direct' | 'partial' | 'contextual' | 'none';
    generationUse?: 'use_directly' | 'use_with_constraints' | 'positioning_only' | 'do_not_use';
    constraintsApplied?: string[];
    missingElements?: Array<
      | 'metrics'
      | 'scope'
      | 'outcome'
      | 'tools'
      | 'leadership_context'
      | 'customer_context'
      | 'timeframe'
    >;
  }>;
};
