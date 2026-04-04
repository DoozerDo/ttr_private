import { Baseline } from './baseline.entity';
import { BaselineSchemaCoreShape } from './baseline-schema';

export type BaselineIdentity = {
  fullName?: string | null;
  currentTitle?: string | null;
  currentCompany?: string | null;
  location?: string | null;
};

export function resolveBaselineIdentity(
  baseline: Baseline,
): BaselineIdentity | undefined {
  const parsed = (baseline.parsedRecords ?? [])
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  if (!parsed || !parsed.parsedJson) {
    return undefined;
  }

  const parsedCore = parsed.parsedJson as Partial<BaselineSchemaCoreShape>;
  const identity = parsedCore.identity;

  if (!identity) {
    return undefined;
  }

  return {
    fullName: identity.full_name?.trim() || null,
    currentTitle: identity.current_title?.trim() || null,
    currentCompany: identity.current_company?.trim() || null,
    location: identity.location?.trim() || null,
  };
}
