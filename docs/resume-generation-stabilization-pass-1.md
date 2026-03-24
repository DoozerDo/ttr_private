# Resume Generation Stabilization Pass 1 (Reliability Gates)

## Canonical resume generation path
- Web proxy: `apps/web/app/api/resume/route.ts` -> API `POST /resume/generate`
- API generation: `apps/api/src/resume/resume.controller.ts` -> `ResumeService.generateResume`
- Drafting/evidence selection: `apps/api/src/resume/resume-draft-bullets.ts`
- Canonical model normalization + validation: `apps/api/src/resume/resume-normalization.ts`
- Preview source of truth: `preview.resume` normalized model
- Export source of truth: normalized model -> `mapNormalizedResumeToDocxModel` / `buildResumePlainText`

## What was strengthened in this pass
- Added explicit normalization helper for deterministic pre-export repair of user-edited models (`normalizeNormalizedResumeDocument`).
- Strengthened normalized-model validation to reject:
  - duplicate role headers in experience entries
  - collapsed punctuation artifact noise (e.g. merged blob punctuation)
  - malformed/oversized merged experience bullet blobs
  - corrupted education rows with placeholder-like or degenerate repeated tokens
- Enforced export-time gate for `editedResume`:
  - normalize -> validate -> reject with typed `NORMALIZATION_FAILED` if structurally unsafe
  - prevents malformed edited payloads from bypassing generation-time safeguards

## Quality gate behavior
- Deterministic repair is applied first (`normalizeNormalizedResumeDocument`).
- If structure remains unsafe, export fails with user-safe typed error and validation reasons.
- Preview/export parity is preserved by keeping both paths anchored to the same normalized model contract.

## Regression fixtures/tests added
- Validation catches duplicate role headers + punctuation collapse artifacts.
- Validation catches oversized merged experience blobs.
- Export rejects malformed edited normalized models.
- Export accepts edited models when deterministic normalization can safely repair pagination artifacts.

## Remaining risks for a later pass
- Runtime section-level compliance still audits section text payloads separately from full normalized-document structural diagnostics.
- Additional fixture coverage can be expanded for extremely noisy OCR edge cases and atypical international date/location formats.
