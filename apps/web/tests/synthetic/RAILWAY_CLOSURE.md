# Railway-first closure gate (Studio golden loop)

For the Studio golden loop, local Vitest passing is **not** closure.

Closure requires running the Railway-facing synthetic validation (no mocks, real API + web):

- `npm -w apps/web run closure:railway:studio-golden-loop`

This gate fails if Railway ends in any partial/contradictory state:
- Resume generated but cover letter missing
- Unsupported requirements CTA visible after generation should complete
- "Retry generation" shown as the unresolved final state
- Missing "Complete set: Resume + cover letter"

