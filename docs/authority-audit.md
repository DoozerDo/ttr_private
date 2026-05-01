# Authority Audit — TargetThisRole (Web + API)

Date: 2026-04-30  
Scope: `apps/web` + `apps/api`  
Goal: map every place that derives workflow/authority/readiness/artifact state and call out competing “workflow authorities”.

## 1. Executive summary

This repo has multiple competing workflow authorities that overlap across three layers:

1) **Canonical decisioning / navigation** (what the user should do next).
2) **Workflow authority + orchestration** (surface canonical state, blocked vs ready, unlock/post-unlock lanes, stale preview suppression).
3) **Studio artifact contract + runtime state** (artifact exists, artifact renderability, export eligibility).

The conflict pattern that shows up most often is: **artifact existence and artifact renderability are decided in multiple places using different inputs**:

- UI state: `resumeState.response` / `coverState.response` in `apps/web/app/(app)/studio/page.tsx`
- Studio contract: `buildStudioArtifactContract` in `apps/web/src/lib/studio/artifactContract.ts`
- Workflow artifact normalizer: `normalizeWorkflowArtifactState` in `apps/web/lib/workflowArtifactStateNormalizer.ts` (can suppress previews during “generation_in_progress/failed”)
- Surface authority: `resolveWorkflowSurfaceAuthority` in `apps/web/lib/workflowSurfaceAuthority.ts` (uses `hasResume/hasCoverLetter` + “blocked” lane)

On the API side, **persistence + read authority** is centralized in `StudioArtifactsService` (`apps/api/src/studio-artifacts/studio-artifacts.service.ts`), but generation services (`ResumeService`, `CoverLettersService`) also decide “blocked vs allowed” and “export ready”.

Net: Yes, there are multiple competing authorities and they can disagree on:
- whether generation is allowed
- whether artifacts exist (and for which inputsHash)
- whether artifacts are renderable vs suppressed as “stale”
- whether Studio/Results should show previews vs blockers
- whether readiness/analysis failures can override existing artifacts

## 2. Authority inventory

“Authority” here means a function/component/helper that decides or derives workflow state, next action, readiness, generation allowed/blocked, artifact existence, artifact renderability, export eligibility, or remediation.

### Web: next action + workflow state

#### `apps/web/lib/canonicalDecision.ts`
- **Name**: `resolveCanonicalState(input)`
- **Decision**: canonical next action + CTA + readiness state + workflow progression (`workflowState`, `primaryAction`, `blockingReason`)
- **Inputs trusted**: `score`, `generationReadiness`, `productReadiness`, `canGenerateDocuments` (studio surface), `analysisCandidates`
- **Outputs**: `CanonicalDecisionResult`
- **Controls**: UI navigation/messaging across baseline/target/results/studio (indirect via page consumers)

#### `apps/web/lib/workflowProgression.ts`
- **Name**: `resolveWorkflowProgression(input)`
- **Decision**: high-level `WorkflowState`, `primaryAction`, `blockingReason` messaging
- **Inputs trusted**: score + readiness + product readiness + surface context
- **Outputs**: workflow progression model embedded in `CanonicalDecisionResult`
- **Controls**: surface messaging + gating rationale (via canonical decision)

#### `apps/web/lib/nextAction.ts`
- **Names**: `getCanonicalNextAction`, `derivePrimaryNextAction`
- **Decision**: produces a “next action” by calling `resolveCanonicalState` with **synthetic** `generationReadiness` and `productReadiness`
- **Inputs trusted**: caller-provided `fitScore`, `generationReady`, `trustGateAllowed` (not the full contract)
- **Outputs**: `NextAction` (`type`, `route`, `reason`)
- **Controls**: navigation CTA in places that do not resolve the full contract

#### `apps/web/lib/pairWorkflowState.ts`
- **Name**: `resolvePairWorkflowState(input)`
- **Decision**: `pairStatus`, `canGenerate`, `primaryCta`, `blockingReason`, per-artifact statuses (`missing|generating|ready|failed`)
- **Inputs trusted**: `canonicalDecision`, optional `analysisStatus`, and `artifacts.{resume,coverLetter}`
- **Outputs**: `PairWorkflowState`
- **Controls**: local Studio CTA/state lane distinct from orchestrator/surface authority

### Web: workflow authority + orchestration (blocked/ready, unlock, stale preview)

#### `apps/web/lib/resolveWorkflowAuthority.ts`
- **Name**: `resolveWorkflowAuthority(input)`
- **Decision**: `workflowState` (`READY|REVIEW_REQUIRED|BLOCKED|PARTIAL`), `primaryAction`, `canGenerate`, `suppressFailureMessaging`
- **Inputs trusted**: score, readiness.blocked, `resumeState.hasOutput/failed`, `coverState.hasOutput/failed`
- **Outputs**: `WorkflowAuthorityResult`
- **Controls**: authority semantics consumed downstream (surface authority + contract + orchestrator)

#### `apps/web/lib/workflowSurfaceAuthority.ts`
- **Name**: `resolveWorkflowSurfaceAuthority(input)`
- **Decision**: `canonicalState` (unlock_required, generation_ready, documents_ready, hard_blocked, generation_failed…), CTA destination/labels, trust tone
- **Inputs trusted**: `generationReadiness`, `workflowAuthority.{workflowState,primaryAction}`, artifact flags `hasResume/hasCoverLetter/pairStatus/generating/failure`, unlock/post-unlock contexts
- **Outputs**: `WorkflowSurfaceAuthorityModel`
- **Controls**: “primary surface state” shown to the user (headline/body/CTA)

#### `apps/web/lib/workflowArtifactStateNormalizer.ts`
- **Name**: `normalizeWorkflowArtifactState(input)`
- **Decision**: `artifactDisplayState`, low-confidence warning, and `shouldSuppressStalePreview` (hides ready outputs during generation_in_progress/generation_failed unless `allowStalePreview`)
- **Inputs trusted**: artifact `status/confidence/failure`, workflow canonical state + trust tone, allowStalePreview
- **Outputs**: `WorkflowArtifactStateNormalizerOutput`
- **Controls**: preview suppression and “artifact truth” messaging

#### `apps/web/lib/workflowAuthorityContract.ts`
- **Name**: `resolveWorkflowAuthorityContract(input)`
- **Decision**:
  - normalizes readiness into `{status, blocked, blockers}`
  - maps resume/cover/pair signals into `artifacts.{resume,coverLetter,pair}` (`missing|generating|generated|failed`)
  - derives `generation.state` (blocked/ready/generating/generated/failed_*)
  - decides `generation.auto.shouldStart` + signature (`autoGen:v1:${baselineVersionId}:${jobId}:${assessmentOrAnalysisId}`)
- **Inputs trusted**: readiness triple, artifact status + hasOutput/failed, ids (baselineId/baselineVersionId/jobId/assessmentId/analysisId), contexts
- **Outputs**: `WorkflowAuthorityContract`
- **Controls**: stable “contract snapshot” used by orchestrator and auto-generation consumers

#### `apps/web/lib/workflowOrchestrator.ts`
- **Name**: `resolveWorkflowOrchestrator(input)`
- **Decision**: composes surface authority + contract + normalized artifact state + unlock/post-unlock/generation-ready models; emits diagnostics on malformed readiness
- **Inputs trusted**: ids, readiness, workflow authority, artifact statuses/failures, activity snapshot, search params context
- **Outputs**: `WorkflowOrchestratorOutput` (`authorityState`, `contract`, `artifactState`, `unlockState`, `postUnlockState`, `generationReadyState`)
- **Controls**: orchestrated single model used by pages to decide what to show

#### `apps/web/lib/workflowGuardrails.ts`
- **Name**: `resolveWorkflowGuardrails(input)` (and helpers)
- **Decision**: detects contradictions between rendered state and orchestrator state (e.g., “stale preview suppressed” vs “preview rendered”)
- **Inputs trusted**: orchestrator artifact state and rendered flags
- **Outputs**: guardrail model + diagnostics
- **Controls**: debug surface for “who is right” during contradictions

### Web: Studio artifact existence, renderability, export eligibility

#### `apps/web/src/lib/studio/artifactContract.ts`
- **Name**: `buildStudioArtifactContract(input)`
- **Decision**:
  - artifact existence/renderability: `hasResumeArtifact`, `hasCoverLetterArtifact`
  - quality + exportability: `quality.*.exportable`, `hasUsableArtifacts`
  - export eligibility: `resumeExportAvailable`, `coverLetterExportAvailable` (requires `canExportDocuments` + `isPro` + action gates)
  - parsing: `resumeModel` (via `readResumeModel`) and cover paragraphs
- **Inputs trusted**: `resumeResponse`, `coverLetterResponse`, `canExportDocuments`, `isPro`, presenter outputs
- **Outputs**: normalized responses, render flags, models, quality, presenters, result envelopes
- **Controls**: Studio rendering and export enablement (should not be replaced by workflow blockers when artifacts exist)

#### `apps/web/src/lib/studio/helpers.ts`
- **Names**: `presentResumeGeneration(payload)`, `presentCoverLetterGeneration(payload)`
- **Decision**: presenter `status` (`success|blocked|error|unknown`), `hasExportableContent`, display text, failure mapping
- **Inputs trusted**: raw generation payload shapes (including nested `payload` and `exports`)
- **Outputs**: presenter models consumed by Studio
- **Controls**: “presenter lane” (should not be conflated with “artifact exists”)

#### `apps/web/src/lib/studio/artifactQuality.ts`
- **Names**: `validateResumeQuality`, `validateCoverLetterQuality`
- **Decision**: quality status/issues and `exportable`
- **Inputs trusted**: parsed resume model / paragraphs
- **Outputs**: quality models
- **Controls**: export gating + quality warnings/remediation (should be separate from preview rendering)

#### `apps/web/lib/resumePreviewContract.ts`
- **Names**: `readResumeModel`, `estimateResumeModelBodyLength`
- **Decision**: what payload shapes count as a valid resume model and how “body length” is computed
- **Inputs trusted**: response payload variants
- **Outputs**: `ResumeModel | null` + size estimate
- **Controls**: resume renderability and quality inputs

### Web: Studio / Results page runtime authorities (the actual render state)

#### `apps/web/app/(app)/studio/page.tsx`
- **Name**: `StudioPage` component (multiple internal hooks/handlers)
- **Decision**:
  - local state truth: `resumeState`, `coverState` (response/error/failure/tier gating)
  - hydration from `/api/studio/artifacts` and mapping payload → state
  - render priority between previews, blockers, remediation lanes, and stale preview suppression
  - export gating uses `artifactContract.*ExportAvailable` + `quality.*.exportable`
- **Inputs trusted**: URL params, orchestrator outputs, `/api/studio/artifacts` payload, analysis/readiness fetches
- **Outputs**: rendered Studio UI and client logs
- **Controls**: dominant UI authority for Studio

#### `apps/web/app/(app)/results/page.tsx`
- **Name**: Results page component
- **Decision**: shows previews vs gating panels; fetches `/api/studio/artifacts` and honors `normalizedArtifacts.shouldSuppressStalePreview`
- **Inputs trusted**: orchestrator/contract + artifacts response
- **Outputs**: rendered Results UI
- **Controls**: Results surface preview visibility and CTA behavior

### API: generation context, readiness, persistence, and artifact reads

#### `apps/api/src/studio-artifacts/studio-artifacts.service.ts`
- **Name**: `StudioArtifactsService`
- **Decision**:
  - persistence: `recordResumeInProgress/Success/Failure`, `recordCoverLetterInProgress/Success/Failure`
  - read authority: `readState(...)` (filters artifacts by computed `inputsHash`)
  - computes: `baselineVersionHash`, `jobFingerprint`, `resumeInputsHash`, `coverLetterInputsHash`
  - readiness-derived suppression logic: can null out some artifacts depending on readiness/template mode
- **Inputs trusted**: DB rows (`studio_artifacts`, `baseline`, `baseline_versions`, `jobs`, `fit_assessment`) and optional `analysisId`
- **Outputs**: `StudioArtifactsState` (pair status + per-artifact record + readiness/debug fields)
- **Controls**: what the web can see from `/studio/artifacts` (and therefore what “exists”)

#### `apps/api/src/studio-artifacts/studio-artifacts.controller.ts`
- **Name**: `StudioArtifactsController.getState(...)`
- **Decision**: validates query params (`baselineId`, `baselineVersionId`, `jobId` required); emits `[STUDIO_ARTIFACTS_FETCH]` + `[STUDIO_ARTIFACTS_RESULT]` logs
- **Inputs trusted**: query params + `request.user.id`
- **Outputs**: `/studio/artifacts` HTTP response
- **Controls**: read-path contract boundary + logs

#### `apps/api/src/studio-artifacts/studio-artifact.entity.ts`
- **Name**: `StudioArtifact` entity (`studio_artifacts` table)
- **Decision**: schema-level source of truth (unique key: `userId+baselineId+jobId`; persisted fields for responseBody/content/status/failures/metadata)
- **Controls**: persistence contract used by readState and generation services

#### `apps/api/src/resume/resume.controller.ts`
- **Name**: `ResumeController.generateResume(...)`, `ResumeController.getGenerationReadiness(...)`
- **Decision**: request parsing/validation (baselineId/jobId required; baselineVersionId optional; analysisId optional); wraps service result into `GenerationOutcome` envelope
- **Inputs trusted**: request body + auth user
- **Outputs**: `/resume/generate`, `/resume/readiness`
- **Controls**: generation endpoint contract shape + status/nextAction envelope

#### `apps/api/src/cover-letters/cover-letters.controller.ts`
- **Name**: `CoverLettersController.generate(...)`, readiness/export endpoints
- **Decision**: enforces feature entitlements; wraps into `GenerationOutcome` envelope; readiness shielding/logging
- **Inputs trusted**: request body + auth user + entitlements
- **Outputs**: `/cover-letters/generate`, `/cover-letters/readiness`, export endpoints
- **Controls**: cover letter generation + entitlement gating contract

#### `apps/api/src/resume/resume.service.ts`
- **Name**: `ResumeService.generateResume(...)` (and internal helpers)
- **Decision (high-level)**:
  - resolves/uses analysis context and existing artifact state (calls `StudioArtifactsService.readState` in some flows)
  - applies quality/compliance/readiness gates and computes exportReady
  - persists via `StudioArtifactsService.recordResume*`
- **Controls**: actual resume generation behavior + persistence writes

#### `apps/api/src/cover-letters/cover-letters.service.ts`
- **Name**: `CoverLettersService.generateCoverLetter(...)` (and internal helpers)
- **Decision (high-level)**:
  - applies readiness + compliance gates (can return controlled “blocked” results)
  - persists via `StudioArtifactsService.recordCoverLetter*`
- **Controls**: cover letter generation behavior + persistence writes

## 3. Conflict map

Concrete overlaps where multiple systems decide the same thing.

### A) Generation allowed / blocked
- Web gate: `shouldGenerateDocuments(score)` (`apps/web/lib/documentGenerationContract.ts`)
- Web authority: `resolveWorkflowAuthority().canGenerate` (`apps/web/lib/resolveWorkflowAuthority.ts`)
- Web surface state: `resolveWorkflowSurfaceAuthority()` uses readiness.blocked and workflowAuthority.workflowState (`apps/web/lib/workflowSurfaceAuthority.ts`)
- Web contract: `resolveWorkflowAuthorityContract().generation.state` (`apps/web/lib/workflowAuthorityContract.ts`)
- API gate: readiness/compliance enforcement inside generation services (`apps/api/src/resume/resume.service.ts`, `apps/api/src/cover-letters/cover-letters.service.ts`)

### B) Artifact existence (“has resume/cover letter”)
- API: `StudioArtifactsService.readState()` returns `resume.responseBody` / `coverLetter.responseBody` but can suppress them based on computed `inputsHash` and readiness/template rules.
- Web contract: `resolveWorkflowAuthorityContract()` maps assorted signals into `artifacts.resume/coverLetter/pair`.
- Web Studio contract: `buildStudioArtifactContract()` derives `hasResumeArtifact/hasCoverLetterArtifact` from response content.
- Web Studio page: can treat `resumeState.response` / `coverState.response` as the canonical truth even when contract says otherwise.

### C) Artifact renderability vs presenter success
- Renderability: `buildStudioArtifactContract().has*Artifact` (content presence + parsed model).
- Presenter status: `presentResumeGeneration` / `presentCoverLetterGeneration` can be stricter (preview/envelope dependent).
- Suppression: `normalizeWorkflowArtifactState().shouldSuppressStalePreview` can hide previews even when artifacts exist.

### D) Export eligibility
- Web: `buildStudioArtifactContract().*ExportAvailable` + `validate*Quality().exportable`
- API: export endpoints enforce entitlements/tier/compliance (`ensureExportTierAvailable`, compliance audit), independent of UI beliefs.

### E) Preview vs blocker priority
- Surface authority may produce `hard_blocked` or `unlock_required` states, but also `documents_ready` when any outputs exist.
- Studio/Results pages have their own ordering rules and can accidentally allow readiness/analysis failures to override preview rendering.
- Workflow artifact normalizer may suppress previews if “stale authority active”.

### F) Generation request context (baselineVersionId, analysisId)
- `/studio/artifacts` requires `baselineVersionId` (strict in controller), and optionally uses `analysisId` to pick assessment inputs.
- `readState` computes inputsHash using `baselineVersionHash`, `jobFingerprint`, and (resume) `assessment.inputsHash`.
- Frontend can source baselineVersionId/analysisId from multiple places; mismatches can make persisted artifacts appear “missing” for the active context.

## 4. Recommended canonical model (single source of truth map)

This is a proposal (audit only) for “one canonical authority per decision”.

### Workflow next action
- Canonical: `resolveCanonicalState` (`apps/web/lib/canonicalDecision.ts`)
- Consumers: `nextAction.ts` and any local “CTA” helpers should become thin wrappers around canonical decisioning with real inputs.

### Artifact existence (persisted)
- Canonical: API `/studio/artifacts` payload (`StudioArtifactsService.readState`), with explicit, stable booleans derived from the returned record fields.
- Consumers: web should use one normalizer to produce `hasResumeArtifactPersisted/hasCoverLetterArtifactPersisted` and log when a consumer chooses to ignore them (e.g., stale suppression).

### Preview renderability (UI)
- Canonical: `buildStudioArtifactContract` for Studio (`apps/web/src/lib/studio/artifactContract.ts`) and an equivalent “Results artifact contract” if Results needs a different shape.
- Rule: renderability must depend on content existence, not exportability, not presenter success.

### Export eligibility
- Canonical (UI): `*ExportAvailable` AND `quality.*.exportable` (strict).
- Canonical (API): export endpoints are authoritative; UI should treat export errors as truth even if UI thought export was allowed.

### Readiness remediation / blockers
- Canonical: `WorkflowSurfaceAuthorityModel` (`apps/web/lib/workflowSurfaceAuthority.ts`) for primary surface state.
- Priority rule: **if artifacts exist and are renderable, previews are primary; blockers are secondary warnings**.

### Generation request context
- Canonical: a single “pair context” object (baselineId/baselineVersionId/jobId/assessmentId/analysisId) computed once and reused for generate + artifacts reads.
- Add mismatch detection (diagnostics only) before any refactor that changes behavior.

## 5. Kill list (duplicate/redundant logic to remove or convert into consumers)

Candidates to remove or convert into consumers of the canonical model:

- `apps/web/lib/nextAction.ts`: duplicates canonical decisioning using synthetic readiness/productReadiness stubs.
- `apps/web/lib/pairWorkflowState.ts`: duplicates CTA/state logic that overlaps with surface authority + canonical decision + contract.
- Any page/component logic that treats presenter “success” as “artifact exists” instead of using renderability contract.
- Any usage of `normalizeWorkflowArtifactState().shouldSuppressStalePreview` as a hard render gate without checking persisted artifacts.
- Any local “blocked” checks in pages that are not derived from `WorkflowSurfaceAuthorityModel.canonicalState`.
- Any direct `shouldGenerateDocuments(score)` checks in UI that ignore the resolved contract (`WorkflowAuthorityContract` / surface authority).

## 6. Refactor sequence (safe consolidation order)

Suggested order of operations (audit only):

1) **Centralize ID context**: define a single “pair context” object (baselineId/baselineVersionId/jobId/assessmentId/analysisId) and thread it through Studio + Results without recomputation; add mismatch diagnostics.
2) **Centralize “artifact exists”**: one web normalizer for `/studio/artifacts` that produces stable `has*` booleans and the normalized response objects used for rendering.
3) **Separate renderability from exportability**: ensure previews render if renderable; keep export gating strict and separate.
4) **Unify preview/blocker priority**: make surface authority the only source of primary blockers, with “previews win when artifacts exist”.
5) **Retire/convert `pairWorkflowState`**: turn into a presenter over the canonical contract rather than an independent authority.
6) **Retire/convert `nextAction.ts`**: stop using synthetic readiness/productReadiness and consume canonical decisioning directly.
7) **Unify stale-preview policy**: never suppress persisted artifacts without an explicit “stale” label and a user override.

