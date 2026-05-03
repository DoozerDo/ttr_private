export type EvidenceStrength = 'strong' | 'partial' | 'weak' | 'unusable';
export type EvidenceSource = 'explicit' | 'inferred_from_resume_text';
export type SupportLevel = 'direct' | 'partial' | 'contextual' | 'none';
export type MissingElement =
  | 'metrics'
  | 'scope'
  | 'outcome'
  | 'tools'
  | 'leadership_context'
  | 'customer_context'
  | 'timeframe';
export type GenerationUse =
  | 'use_directly'
  | 'use_with_constraints'
  | 'positioning_only'
  | 'do_not_use';

export type EvidenceConstraint =
  | 'no_invented_metrics'
  | 'no_inferred_scope'
  | 'no_inferred_tools'
  | 'no_inferred_leadership'
  | 'use_constrained_language_only';

export type EvidenceItem = {
  id: string;
  text: string;
  evidenceStrength: EvidenceStrength;
  evidenceSource: EvidenceSource;
  supportLevel: SupportLevel;
  missingElements: MissingElement[];
  generationUse: GenerationUse;
  extracted?: {
    action?: string | null;
    domain?: string | null;
    tools?: string[] | null;
    outcome?: string | null;
    metrics?: string[] | null;
    scope?: string | null;
    timeframe?: string | null;
  };
  constraints?: EvidenceConstraint[];
};

export type InterpretedEvidenceSummary = {
  strongEvidenceCount: number;
  partialEvidenceCount: number;
  weakEvidenceCount: number;
  unusableEvidenceCount: number;
};

export type InterpretedEvidence = {
  items: EvidenceItem[];
  summary: InterpretedEvidenceSummary;
};

