# Workflow Authority Contract (Results + Studio)

This repo uses a **workflow authority system** to ensure Results and Studio present a single, deterministic truth about:

- what state the user is in (blocked / unlock required / ready / generating / complete / failed)
- what artifacts are actually usable (resume / cover letter / partial / stale / low-confidence)
- what async work is happening (analysis, unlock re-evaluation, generation)
- how that truth is presented (single primary action; consistent trust framing)

The contract is enforced as architecture (orchestrator + lint + tests), not convention.

## Single entry point

All workflow state composition MUST go through:

- `apps/web/lib/workflowOrchestrator.ts`

Pages and components should **not** call lower-level resolvers directly.

The orchestrator is responsible for composing:

- cross-surface authority: `@/lib/workflowSurfaceAuthority`
- artifact truth normalization: `@/lib/workflowArtifactStateNormalizer`
- unlock context parsing: `@/lib/studioUnlockResolver`
- post-unlock outcome: `@/lib/postUnlockOutcomeResolver`
- generation-ready priority model: `@/lib/studioGenerationReadyResolver`
- activity snapshot pass-through: `@/lib/workflowActivityTracker`

## Precedence / hierarchy

Studio and Results must not render competing authorities simultaneously.

Canonical precedence (highest → lowest):

1. Fatal / malformed state shells (page-level failures)
2. Unlock flow (Fit Review “primary unlock” → Studio unlock)
3. Post-unlock outcome shell (after “Save and re-evaluate”)
4. Generation-ready shell (`unlocked_ready` / ready-to-generate conversion moment)
5. Normal workspace / documents preview

`workflowOrchestrator` enforces key precedence in output (e.g., unlock suppresses post-unlock).

## Artifact truth rules

Artifact presence must never override workflow authority.

Use the normalized artifact output from the orchestrator to drive any artifact messaging:

- partial success must not be presented as full success
- low-confidence outputs must not inherit high-confidence trust framing
- stale outputs must be suppressed when a newer attempt is in progress or stricter authority applies

## Async activity rules

Async work must be visible, deterministic, and driven by real triggers only.

- `useWorkflowActivityTracker` is the source of truth for page-level activity
- `WorkflowActivityBanner` shows the highest-priority operation (generation > unlock > analysis)
- primary CTAs that would duplicate the active operation should be disabled while active

No fake progress percentages or timers.

## Guardrails (development only)

Dev-time warnings are emitted by:

- `apps/web/lib/workflowGuardrails.ts`

These warnings detect contract violations such as:

- multiple primary authorities rendered at once
- generation-ready shell rendered while unlock/post-unlock is active
- stale previews rendered while suppression is required

Guardrails must never crash production; they are warnings only and only active in development.

## Enforcement

### ESLint import guard (hard ban)

`apps/web/eslint-rules/workflow-import-guard.mjs` prevents importing the following resolver modules outside the orchestrator:

- `@/lib/workflowSurfaceAuthority`
- `@/lib/workflowArtifactStateNormalizer`
- `@/lib/studioUnlockResolver`
- `@/lib/postUnlockOutcomeResolver`
- `@/lib/studioGenerationReadyResolver`

Only `apps/web/lib/workflowOrchestrator.ts` may import them. (Tests are excluded.)

### System contract tests

Contract-level tests live in:

- `apps/web/tests/workflow-system-contract.test.ts`

These tests validate precedence and “one authority at a time” guarantees using the orchestrator output only (not UI snapshots).

## Extending safely

When adding new workflow features:

1. Add new low-level logic as a resolver/module in `apps/web/lib/`
2. Compose it in `apps/web/lib/workflowOrchestrator.ts`
3. Update any affected pages to use orchestrator output only
4. Add a system-contract test case for the new state combination
5. If a new render branch is introduced, add a guardrail check for conflicting shells (dev-only)

Never introduce ad hoc Results-only or Studio-only state interpretation branches for canonical workflow states.

## Debugging workflow contract violations

Contract violations are **dev-only** and are emitted via:

- Runtime warnings: `apps/web/lib/workflowGuardrails.ts`
- Dev-only analytics event: `workflow_contract_violation_detected`

### Deduping

Violations are deduped **per mounted page lifecycle** (per mount). Identical violations will only emit once; if the meaningfully relevant conflict bits change, a new violation emits.

### Violation types

- `multiple_primary_authorities`: More than one authority surface rendered at once (unlock/post-unlock/generation-ready/authority panel).
- `generation_ready_conflicts_with_unlock`: Generation-ready rendered while unlock flow is active.
- `generation_ready_conflicts_with_post_unlock`: Generation-ready rendered while post-unlock outcome is active.
- `stale_preview_rendered_while_suppressed`: A stale preview was rendered while the artifact normalizer required suppression.
- `unknown_workflow_fallthrough`: Orchestrator detected malformed/unknown inputs or an impossible authority mismatch and returned a conservative fallback.

### DOM debug attributes

Authority shells and panels include stable attributes to inspect in the DOM:

- `data-workflow-shell`
- `data-workflow-state`
- `data-workflow-trust-tone`

Use these to confirm which shell/panel is currently authoritative on Results or Studio, and to quickly correlate a warning back to what actually rendered.

### First files to inspect

- State composition: `apps/web/lib/workflowOrchestrator.ts`
- Authority model: `apps/web/lib/workflowSurfaceAuthority.ts`
- Artifact truth: `apps/web/lib/workflowArtifactStateNormalizer.ts`
- Runtime warnings + dedupe: `apps/web/lib/workflowGuardrails.ts`
- Canonical rendering: `apps/web/components/workflow/WorkflowAuthorityPanel.tsx`

## Synthetic workflow journey scenarios

Scenario-based validation lives in:

- `apps/web/tests/workflow-journey-scenarios.test.tsx`

These tests exercise cross-surface transitions (Results ↔ Studio) with realistic state evolution and assert:

- canonical authority state + trust tone are consistent
- only one primary authority is active at a time
- activity banner appears during async operations
- artifact truth is explicit (partial failures, stale suppression)

Covered scenarios:

- A. Happy path (generate → both artifacts ready)
- B. Unlock path (unlock → reanalysis → unlocked_ready → generate)
- C. Unlock improves but still blocked (`improved_still_blocked`)
- D. No material change (`no_material_change`)
- E. Reanalysis failure (`reanalysis_failed`)
- F. Partial artifact failure (one succeeds, one fails retryable)
- G. Stale output suppression (older drafts suppressed during newer attempt)
- H. Impossible state safety (orchestrator fallback + structured violation)
