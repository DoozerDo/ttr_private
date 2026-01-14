# Turbopack root warning
- Running `npm -w apps/web run build` can surface the "Next.js inferred your workspace root" warning from Turbopack.
- It fires because Turbopack sees multiple lockfiles across the monorepo even though the build targets `apps/web`.
- No config change is required; ignore it until we explicitly configure Turbopack.

# Baseline-browser-mapping warning
- The same build also logs `[baseline-browser-mapping] The data in this module is over two months old`.
- The message comes from Next.js' dependency on `baseline-browser-mapping` (under `node_modules/baseline-browser-mapping`) warning that its static dataset is older than two months; it appears before the downstream build error triggered by the workspace root issue.
- The warning is informational only; Next still runs using the packaged data, so no additional work is needed unless we deliberately update that dependency.
