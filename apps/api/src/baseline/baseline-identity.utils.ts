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
    return resolveIdentityFromSections(baseline);
  }

  const parsedCore = parsed.parsedJson as Partial<BaselineSchemaCoreShape>;
  const identity = parsedCore.identity;

  if (!identity) {
    return resolveIdentityFromSections(baseline);
  }

  return {
    fullName: identity.full_name?.trim() || null,
    currentTitle: identity.current_title?.trim() || null,
    currentCompany: identity.current_company?.trim() || null,
    location: identity.location?.trim() || null,
  };
}

function resolveIdentityFromSections(baseline: Baseline): BaselineIdentity | undefined {
  const candidateLines = (baseline.sections ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((section) =>
      (section.content ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    );

  const fullName = candidateLines.find((line) => {
    if (/^(summary|experience|skills|education|technical skills|professional experience|projects?)$/i.test(line)) {
      return false;
    }
    if (/^[\-\u2022•]/.test(line)) {
      return false;
    }
    return line.split(/\s+/).length >= 2 && line.length <= 80;
  });

  if (!fullName) {
    return undefined;
  }

  return {
    fullName,
    currentTitle: null,
    currentCompany: null,
    location: null,
  };
}
