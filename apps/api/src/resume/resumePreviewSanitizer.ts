import type { NormalizedResumeDocument } from '../documents/normalized-document.models';
import { normalizeNormalizedResumeDocument } from './resume-normalization';

export function sanitizeResumePreviewForStudio(
  resume: NormalizedResumeDocument,
): NormalizedResumeDocument {
  return normalizeNormalizedResumeDocument(resume);
}
