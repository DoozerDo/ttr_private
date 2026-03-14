import type { BaselineIdentity } from '../../baseline/baseline-identity.utils';
import type { ResumeDraftBullet } from '../../resume/resume-draft-bullets';
import type { NormalizedResumeDocument } from '../../documents/normalized-document.models';
import {
  mapNormalizedResumeToDocxModel,
} from '../../resume/resume-normalization';
import type { BaselineSectionType } from '../../baseline/baseline-section.entity';

export type ResumeExportSection = {
  id?: string;
  type?: BaselineSectionType | string | null;
  title?: string | null;
  content?: string | null;
  order?: number;
  includePolicy?: string;
  source?: string;
  bullets?: ResumeDraftBullet[] | Array<{ text?: string | null }>;
  rawContent?: string | null;
};

export function mapResumeSectionsToDocxModel(
  _sections: ResumeExportSection[],
  _identity?: BaselineIdentity,
  options?: { normalizedDocument?: NormalizedResumeDocument | null },
) {
  const normalized = options?.normalizedDocument ?? null;
  if (!normalized) {
    throw new Error(
      'Resume renderer requires a canonical normalized resume model. Raw section rendering is disabled.',
    );
  }
  return mapNormalizedResumeToDocxModel(normalized);
}
