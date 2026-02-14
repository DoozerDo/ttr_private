# Embedding pipeline

## Why pgvector?
We rely on PostgreSQL and TypeORM today, so adding the `vector` extension keeps the stack simple while giving us cosine-distance primitives that are performant and deterministic inside the database.

## Where embeddings live
- `jobs.embedding` stores the normalized job text embedding (1536‑dimensional, nullable).
- `baseline_sections.embedding` stores each canonical section embedding with the same dimensionality.
- Both columns are indexed using IVFFLAT over the cosine operator so similarity queries stay fast even as baselines grow.

## Measuring similarity
Gap detection now compares each baseline section against the job embedding through `section.embedding <=> job.embedding`. The resulting cosine distance is inverted (`1 - distance`) and clamped to `[0, 1]`, so that higher numbers indicate better coverage.

## Blending heuristics
Each demand segment retains the former token-overlap heuristics (`coverageRatio`). Before emitting a gap we require `vectorSimilarity < 0.25` (weak coverage). The final coverage score is blended:

```
finalScore = (0.6 * vectorSimilarity) + (0.4 * heuristicScore)
```

`finalScore` now drives the confidence label (`0 ⇒ high`, `< 0.25 ⇒ medium`, else `low`), and debug output records every section’s similarity, applied threshold, and blended gap scores.

## Future path
- `EmbeddingService` is wired through `AiModule` and defaults to OpenAI’s `text-embedding-3-small` unless `AI_EMBEDDING_MODEL` overrides it.
- To add model routing later, extend `AiModule` with a strategy selector that evaluates, e.g., request tags or `ConfigService` flags before calling the underlying API. The integration points (jobs/baselines) already go through `EmbeddingService`, so routing logic stays centralized without touching gap detection.
