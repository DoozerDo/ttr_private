# SPEC CONTRACT — Frozen Reference

## 1. Definitions and Scope Boundaries
- **Baseline**: User-uploaded, parsed résumé source split into immutable content blocks (summary, experience, programs/projects, skills, education) with hash verification for integrity.
- **Baseline Version**: A saved snapshot of a baseline with a cryptographic hash; new versions are created when validated additions or tag changes are applied.
- **Block**: An individual baseline section entry (e.g., a single experience bullet or program) that can be tagged and ordered within a version.
- **Include Tags**:
  - **Always**: Block must be included in all tailored outputs for the selected baseline version.
  - **Optional**: Block may be included/excluded based on generator selection or relevance.
  - **Never**: Block is excluded from all tailored outputs and fit computations for the version.
- **Compliance**: Enforcement layer preventing invented roles, companies, metrics, technologies, or scope inflation; validates timeframe and writing rules and records validation outcomes per artifact.
- **Audit Trail**: Structured log of generation/scoring actions capturing inputs, baseline version hash, compliance results, and generated artifact identifiers for traceability.
- **Export Artifact**: Generated user-facing files (DOCX/PDF) or structured CSV exports derived from verified content and stored in versioned storage.
- **Out of Scope**: UI/UX layouts, payment/billing flows, Interview Toolkit, coach/enterprise features, SSO, and any scraping/auto-apply automation.

## 2. API Contracts
All endpoints require authenticated requests scoped to the resource owner. Timestamps are ISO-8601. IDs are UUIDs unless noted.

### 2.1 Compatibility/Fit Scoring
- **Request** `POST /api/fit-scores`
```json
{
  "job": {"id": "...", "raw_jd": "...", "parsed_jd": {"responsibilities": [], "requirements": []}},
  "baseline_version_id": "...",
  "selected_block_ids": ["..."]
}
```
- **Response** `201`
```json
{
  "fit_score": 0,
  "verdict": "apply|consider|skip",
  "breakdown": {
    "experience_alignment": 0,
    "leadership_level": 0,
    "technical_platform_fit": 0,
    "industry_context": 0,
    "strategic_vs_tactical": 0
  },
  "compliance_flags": [{"code": "scope_inflation|missing_baseline_hash", "message": "..."}],
  "audit_id": "..."
}
```

### 2.2 Baseline Block Tagging & Version Selection
- **Request** `PATCH /api/baselines/:baselineId/blocks`
```json
{
  "baseline_version_id": "...",
  "blocks": [
    {"id": "...", "include_tag": "always|optional|never", "order_index": 1}
  ]
}
```
- **Response** `200`
```json
{
  "baseline_version_id": "...",
  "updated_blocks": [{"id": "...", "include_tag": "always", "order_index": 1}],
  "new_version_id": "...", "hash": "..."
}
```

### 2.3 Résumé Generation
- **Request** `POST /api/resumes`
```json
{
  "job_id": "...",
  "baseline_version_id": "...",
  "include_block_ids": ["..."],
  "export_format": "docx|pdf"
}
```
- **Status** `GET /api/resumes/:requestId`
```json
{"status": "pending|failed|ready", "compliance_flags": [...], "artifact_id": "..."}
```
- **Download** `GET /api/resumes/:requestId/download`
Binary stream; headers include `X-Baseline-Hash` and `Content-Type` for requested format.

### 2.4 Cover Letter Generation
- **Request** `POST /api/cover-letters`
```json
{
  "job_id": "...",
  "baseline_version_id": "...",
  "opening": "Dear Hiring Team,",
  "export_format": "docx|pdf"
}
```
- **Status** `GET /api/cover-letters/:requestId`
```json
{"status": "pending|failed|ready", "compliance_flags": [...], "artifact_id": "..."}
```
- **Download** `GET /api/cover-letters/:requestId/download`
Binary stream with `X-Baseline-Hash` and `Content-Type` set.

### 2.5 Application Log (Job Tracker)
- **Create** `POST /api/applications`
```json
{
  "job_id": "...",
  "company": "...",
  "title": "...",
  "applied_date": "2025-01-30",
  "stage": "applied|interviewing|offer|closed",
  "fit_score": 88,
  "notes": "..."
}
```
- **List** `GET /api/applications?stage=&company=` → array of records.
- **Update** `PATCH /api/applications/:id`
```json
{"stage": "interviewing", "notes": "...", "fit_score": 90}
```
- **Export** `GET /api/applications/export`
Returns CSV artifact metadata `{ "artifact_id": "...", "url": "..." }` for download.

### 2.6 Compliance/Audit & Export Storage
- **Audit Log Create** `POST /api/audit`
```json
{
  "action": "fit_score|resume_gen|cover_letter_gen|application_export",
  "actor_id": "...",
  "baseline_version_id": "...",
  "artifact_id": "...",
  "compliance_flags": [...]
}
```
- **List** `GET /api/audit?artifact_id=&action=` → array with timestamps and actor ids.
- **Storage**: Export artifacts stored in S3-compatible storage with object keys incorporating user id, artifact type, and baseline hash; responses surface time-limited URLs when downloads are not streamed directly.

## 3. Validation Rules and Error Format
- **Auth & Ownership**: All requests require authenticated user; resources must belong to requester. Cross-user access returns `403`.
- **Baseline Requirements**: baseline_version_id must exist and match stored hash; blocks tagged `never` cannot be supplied to scoring or generators.
- **Content Limits**: No invented companies, roles, metrics, technologies, or timeframe violations; cover letter opening is locked to “Dear Hiring Team,”.
- **Request Validation**: Unknown enum values → `422`; missing required fields → `400`; unsupported export formats → `415`.
- **Error Response** (pattern for all endpoints):
```json
{ "error": { "code": "bad_request|unauthorized|forbidden|not_found|conflict|unprocessable", "message": "...", "details": {} } }
```

## 4. Acceptance Criteria
- **Compatibility Engine**: Produces 0–100 Fit Score with five-category breakdown and verdict aligned to JD and selected baseline version; compliance flags attached and audit logged.
- **Baseline Tagging**: Blocks can be set to always/optional/never; updates yield a new baseline version and hash; ordering preserved.
- **Résumé Generator**: Accepts baseline version and block selection; enforces compliance; generates DOCX/PDF with baseline hash headers; status and download endpoints work.
- **Cover Letter Studio**: Honors locked opening and baseline-scoped content; generates one-page DOCX/PDF; exposes status and download with compliance visibility.
- **Compliance/Audit**: Every generation/scoring/export action records audit entries with actor, baseline version hash, and flags; retrieval available by action or artifact.
- **Export/Storage**: Artifacts stored in S3-compatible storage with user- and hash-aware keys; downloads stream binary or return time-limited URLs; headers expose baseline hash.
