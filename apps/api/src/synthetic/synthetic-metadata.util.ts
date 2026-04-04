import {
  SyntheticMetadataInput,
  SyntheticRunContext,
  SyntheticTaggableEntity,
} from './synthetic-metadata.types';

export function buildSyntheticRunContext(
  scenarioKey: string,
  runId: string,
): SyntheticRunContext {
  return {
    scenarioKey,
    runId,
    syntheticCreatedAt: new Date(),
  };
}

export function buildSyntheticMetadata(
  input: SyntheticMetadataInput = {},
): Required<Pick<SyntheticTaggableEntity, 'isSynthetic' | 'preserveFromCleanup'>> &
  Omit<SyntheticTaggableEntity, 'isSynthetic' | 'preserveFromCleanup'> {
  return {
    isSynthetic: input.isSynthetic ?? true,
    syntheticScenarioKey: input.syntheticScenarioKey ?? null,
    syntheticRunId: input.syntheticRunId ?? null,
    syntheticCreatedAt: input.syntheticCreatedAt ?? new Date(),
    preserveFromCleanup: input.preserveFromCleanup ?? false,
  };
}

export function applySyntheticMetadata<T extends SyntheticTaggableEntity>(
  entity: T,
  input: SyntheticMetadataInput = {},
): T {
  const metadata = buildSyntheticMetadata(input);
  entity.isSynthetic = metadata.isSynthetic;
  entity.syntheticScenarioKey = metadata.syntheticScenarioKey;
  entity.syntheticRunId = metadata.syntheticRunId;
  entity.syntheticCreatedAt = metadata.syntheticCreatedAt;
  entity.preserveFromCleanup = metadata.preserveFromCleanup;
  return entity;
}

export function isSyntheticRecord(entity: SyntheticTaggableEntity | null | undefined): boolean {
  return Boolean(entity?.isSynthetic);
}
