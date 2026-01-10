# Fit Score Debug Mode

Debug mode is a per-request toggle that only takes effect when `NODE_ENV` is not `production`. You can enable it either by:

- adding `?debug=1` to the `/api/fit-scores` URL, or
- sending the header `x-ttr-debug: 1` on the POST request.

When debug is on the API response includes a `debug` object that is otherwise omitted. The object contains three sections:

| Section | Contents |
| --- | --- |
| `request` | `debugEnabled` (always `true` when present), the source of the debug flag (`header`, `query`, `body`, or `none`), and the baseline + job IDs used for the call. |
| `baseline` | Baseline metadata: ids, version number, stored hash (or `sha256` of the assembled sections), total characters/words, and per-section character counts. |
| `job` | Job metadata: id, inferred source (`url`, `paste`, or `unknown`), character/word counts for raw and normalized content, and the chosen text source used for scoring along with its hash. |
| `scoring` | Aggregation details: raw vs final score, per-dimension scores, verdict enum, applied weights and normalization total, gates (clamp events), penalties (compliance flags), key term counts, and the summary basis string (currently `keyword_frequency_overlap`). |

### Example curl

```bash
curl -X POST http://localhost:3000/api/fit-scores?debug=1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "baseline_version_id": "a06828a9-cfea-4775-a4b5-1f2423b8b62e", "job": { "raw_jd_text": "..." } }'
```

The response will include:

```json
"debug": {
  "request": { ... },
  "baseline": { ... },
  "job": { ... },
  "scoring": { ... }
}
```

Use the hash/length metadata and scoring breakdown to confirm deterministic behavior without exposing full text.
