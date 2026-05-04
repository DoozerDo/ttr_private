# TargetThisRole Current State Inventory (Phase 1)

Source of truth for intended behavior: `docs/manual_target_this_role_workflow_blueprint.md` (May 3, 2026).

This document inventories how the repo works *today*, and where it diverges from the blueprint. No behavior changes are introduced in this phase.

## 1. Resume generation path (current)

**Primary service**
- `apps/api/src/resume/resume.service.ts`

**Structured baseline dependency**
- Extracts template input via `extractStructuredBaselineFromSections()` from `apps/api/src/baseline/structuredBaselineExtractor.ts`.
- Template-readiness evaluation via `evaluateBaselineTemplateReadiness()` from `apps/api/src/baseline/baselineTemplateReadiness.ts`.

**Readiness enforcement (Studio lane)**
- `resume.service.ts` enforces template readiness when `jobId && analysisId && !request.oneTap`.
- When enforced, it throws `UnprocessableEntityException` with `code: baseline_template_not_ready` if `templateReadinessForBaseline.canGenerateResume === false`.
- There is additional extracted-text logic (`getInsufficientExtractedTextDetails`) that can trigger minimal fallback behavior or (if truly empty) hard failures.

**Template assembly**
- `apps/api/src/resume/resume-generation-v2.ts` calls `assembleResumeFromStructuredBaseline()` from `apps/api/src/resume/resumeTemplateAssembler.ts`.

**Audit / trace**
- The resume pipeline includes an `ArtifactTraceAudit` concept (see imports and tests in `apps/api/src/resume/resume.service.ts` and `apps/api/src/resume/resume.service.spec.ts`).
- Current trace audit tracks selected vs unused evidence IDs and mappings, but it does not model the blueprint’s evidenceStrength/evidenceSource/supportLevel/missingElements/generationUse.

## 2. Cover letter generation path (current)

**Primary service**
- `apps/api/src/cover-letters/cover-letters.service.ts`

**Structured baseline dependency**
- Uses `extractStructuredBaselineFromSections()` and `evaluateBaselineTemplateReadiness()` similarly to resume.

**Template assembly**
- `apps/api/src/cover-letters/coverLetterTemplateAssembler.ts` provides `assembleCoverLetterFromStructuredBaseline()`.

**Audit / trace**
- Cover letter pipeline also carries audit identifiers through the controller/service contract (see `apps/api/src/cover-letters/cover-letters.controller.generation-contract.spec.ts` and service tests).
- As with resume, audit is present but not aligned to the blueprint’s evidence interpretation metadata requirements.

## 3. Baseline extraction / parsing (current)

**Structured baseline extraction**
- `apps/api/src/baseline/structuredBaselineExtractor.ts` extracts:
  - `summary`
  - `skills` (bullets or comma-separated lines)
  - `education`
  - `experience[]` (requires a “safe” header parse with company + role title; then collects bullet/implicit bullet lines)
  - `missingEvidenceReasons[]` (freeform strings)

**Key current limitation (root of “fit score ok, generation blocked”)**
- If the resume is messy in a way that prevents parsing “safe” experience headers, `experience[]` becomes empty and `missingEvidenceReasons` includes:
  - `No safely structured experience entries found (company + role title required).`
- This is a strict structural requirement that can interpret “messy but real experience” as “no experience”.
- There is currently no deterministic “interpret messy resume text into structured evidence” layer as described in the blueprint.

## 4. Evidence handling (current)

**What exists**
- Structured baseline provides `missingEvidenceReasons` strings and parsed experience/skills.
- Generation pipelines include an `ArtifactTraceAudit` that maps rendered output to evidence IDs (traceability).

**What’s missing vs blueprint**
- No explicit evidence interpretation model with:
  - `evidenceStrength` (strong/partial/weak/unusable)
  - `evidenceSource` (explicit vs inferred_from_resume_text)
  - `supportLevel` (direct/partial/contextual/none)
  - `missingElements` (metrics/scope/outcome/tools/etc.)
  - `generationUse` (use_directly/use_with_constraints/positioning_only/do_not_use)
- No deterministic “safe inference from resume text” that can convert messy statements into *constrained* evidence items while prohibiting fabricated metrics/scope.
- Current system relies primarily on the structured baseline extractor’s experience model; evidence that fails that structure effectively disappears.

## 5. Artifact readiness logic (current)

**Baseline template readiness**
- `apps/api/src/baseline/baselineTemplateReadiness.ts`:
  - Computes `stats.validExperience` based on “allowed structured template experience headers”.
  - Emits `canGenerateResume/canGenerateCoverLetter`, `hardBlockReasons`, `warnings`, and `evidence.threshold`.
  - Recent changes in this repo relax gating so that `hasValidExperience` allows generation, and uses warnings for degraded evidence.

**Studio artifacts readiness surface**
- `apps/api/src/studio-artifacts/studio-artifacts.service.ts` computes:
  - `artifactReadiness: 'ready' | 'degraded' | 'blocked'` plus `artifactReadinessReasons` and `artifactReadinessReasonDetails`.
  - Readiness is derived from `evaluateBaselineTemplateReadiness(structured)`.
  - The service now ensures `validExperience` appears in reason details.

**Contract note (authoritative)**
- Baseline creation + CX Fit scoring is the only eligibility gate.
- Any readiness/evidence/template/compliance signals must not act as separate Studio generation or export gates once the user has reached Studio.
- If `baselineExists === true` and `cxFitScore >= 80`, Studio must allow resume generation, cover letter generation, and export.

## 6. Studio generation gating (current)

**Studio page**
- `apps/web/app/(app)/studio/page.tsx`

**Key data source**
- `GET /api/studio/artifacts` payload fields:
  - `artifactReadiness`, `artifactReadinessReasons`, `artifactReadinessReasonDetails`

**Gating behavior**
- Studio currently derives eligibility inputs from readiness/evidence/template signals (ex: `validExperience`, hard block reasons).

**Required contract**
- Studio is execution only and must not judge eligibility based on structured examples, evidence count, missing evidence reasons, normalized model completeness, or template readiness.
- Studio eligibility must be derived only from:
  - `baselineExists === true`
  - `cxFitScore >= 80`

## 7. Audit metadata / trust & compliance (current)

**What exists**
- Compliance/audit IDs are threaded through resume and cover-letter generation contracts.
- Resume has a trace audit builder and tests asserting trace selection/unused evidence.
- Cover letters have generation contract tests validating audit fields exist.

**What’s missing vs blueprint**
- Audit does not yet expose:
  - which evidence items were used with `evidenceStrength` and `evidenceSource`
  - constraints applied (no-metrics/no-scope-inflation language rules)
  - omissions due to insufficient support
- There is no shared “evidence interpreter output” feeding both generation and audit.

## 8. What matches the blueprint today

- Strong emphasis on “do not fabricate” exists throughout compliance gating and audit mechanics.
- Generation is structured-baseline-driven (not freeform), which naturally limits hallucination relative to raw-text generation.
- Studio now respects backend “usable evidence exists” via `validExperience` and shows degraded instead of blocked in that case.
- Artifact readiness now reflects “validExperience > 0 => degraded not blocked” for template-not-ready cases.

## 9. What is missing / incorrect vs blueprint (gaps)

### A) Missing interpretation layer (highest priority)
- No deterministic interpreter that converts messy resume text into constrained evidence items.
- Evidence that doesn’t fit strict parsing becomes “missing”, even when real experience exists.

### B) Partial evidence handling is incomplete
- Current readiness uses structured experience headers as the main truth signal.
- Under the updated contract, partial/weak evidence handling is still important for quality and truthfulness, but it must not be used as a Studio gate once baseline eligibility is met.

### C) Readiness depends on parser success more than evidence truth
- The extractor requires safe company+role headers; failure leads to `validExperience === 0`.
- The system should improve extraction and interpretation accuracy, but Studio must not block generation or export based on parser output when `baselineExists === true` and `cxFitScore >= 80`.

### D) Constrained generation rules are not modeled centrally
- There are many compliance checks, but no explicit generation constraints derived from evidenceStrength (e.g., “never add metrics unless explicit” for partial evidence).

### E) Audit trail does not report blueprint evidence model
- Trace auditing exists, but not the blueprint’s evidenceStrength/evidenceSource/supportLevel/missingElements/generationUse with omissions.

## 10. Brittle / duplicated logic

- Readiness concepts exist in multiple places:
  - `baselineTemplateReadiness.ts`
  - `studio-artifacts.service.ts`
  - Studio UI derives additional state from reason details
- Without a centralized evidence interpretation model feeding all three, behavior will remain fragile and hard to reason about.

## 11. Smallest safe next phase (recommended)

**Phase 2 (per blueprint): fixtures + test-first foundation**, before production changes:
- Add unit tests for an evidence interpretation pass (new module) that:
  - converts messy text statements into “partial” evidence items without inventing metrics/scope/tools
  - classifies vague statements as weak/unusable
- Add readiness tests that:
  - treat partial evidence as degraded (generation allowed)
  - only block when evidence is truly unusable/absent

No scoring changes.
