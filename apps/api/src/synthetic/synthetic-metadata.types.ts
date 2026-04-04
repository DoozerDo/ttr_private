export type SyntheticMetadataInput = {
  isSynthetic?: boolean;
  syntheticScenarioKey?: string | null;
  syntheticRunId?: string | null;
  syntheticCreatedAt?: Date | null;
  preserveFromCleanup?: boolean;
};

export type SyntheticRunContext = {
  scenarioKey: string;
  runId: string;
  syntheticCreatedAt: Date;
};

export type SyntheticTaggableEntity = {
  isSynthetic?: boolean;
  syntheticScenarioKey?: string | null;
  syntheticRunId?: string | null;
  syntheticCreatedAt?: Date | null;
  preserveFromCleanup?: boolean;
};
