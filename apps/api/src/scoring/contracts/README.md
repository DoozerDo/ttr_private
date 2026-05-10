## Scoring contract authority

This directory contains scoring contract snapshots used to keep client/server expectations aligned.

### Canonical scorer

The canonical CX Fit scorer implementation is:

- `apps/api/src/analysis/cx-fit-scoring-v2.ts`

### Contract ownership (TODO)

There is currently ambiguity about the intended direction of authority:

- **Option A (preferred):** `scoring_contract_v1.json` is generated from code and should not be edited by hand.
- **Option B:** code is expected to follow `scoring_contract_v1.json` as the source-of-truth.

TODO(authority): pick one direction and enforce it (CI check and/or generation step), so future contributors
do not create competing scoring contract definitions.

