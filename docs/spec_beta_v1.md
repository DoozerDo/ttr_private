TARGET THIS ROLE
Application Specification
Beta v1.0

Last updated January 2026

1. Product Overview

Target This Role is a precision career intelligence platform that:

Scores a candidate’s alignment to a job posting.

Generates compliance validated resumes and cover letters.

Provides interview preparation tools.

Conducts an AI guided Baseline Expansion Interview to surface underrepresented but real experience and improve Fit Scores truthfully.

The platform emphasizes truth, auditability, and zero fabrication through a mandatory Compliance Engine.

Designed for job seekers, career coaches, recruiters, and outplacement programs.

Beta scope supports web only. Mobile and desktop clients are post beta.

2. Core User Modules
2.1 Target This Role Core Flow

Features:

Job description ingestion via pasted text or URL.

URL ingestion performs HTML fetch and text normalization.

Job descriptions are normalized into Responsibilities and Requirements.

Compatibility Check produces a CX Fit Score from 0 to 100.

Five scoring dimensions:

Experience alignment

Leadership level

Technical platform fit

Industry and context

Strategic versus tactical fit

Verdict output is Apply, Consider, or Skip.

Fit Review page displays:

CX Fit Score

Verdict

Strengths and gaps

Compliance flags

Primary action “I think I’m qualified” launches the Baseline Expansion Interview.

2.2 Baseline Library

Features:

Upload locked baseline resume in DOCX or PDF format.

Automatic parsing into:

Summary

Experience

Programs or projects

Skills

Education

Parsed content stored as immutable blocks with cryptographic hashes.

Baseline versioning system creates a new version per approved change.

Block level inclusion policies:

Always include

Optional include

Never include

All downstream scoring and generation must reference a verified baseline version.

2.3 Tailored Resume Generator

Features:

Resume generation requires selecting a baseline version.

Users may select approved blocks before export.

Generated resumes must:

Stay within factual baseline scope

Preserve chronological ordering with most recent roles first

Follow writing rules with no stylized punctuation

Export formats:

DOCX

PDF

Compliance validations enforce:

No new roles

No invented achievements

No fictional technologies

No scope inflation

One tap resume generation unlocks when CX Fit Score is at least 92 percent.

2.4 Cover Letter Studio

Features:

Cover letters limited to one page with an approximate 350 word cap.

Opening line is locked to “Dear Hiring Team,”.

Body paragraphs may only reference baseline verified experience.

Closing paragraph is selected from a user configurable template.

Compliance forbids:

Invented scope

Invented metrics

Unknown companies or roles

2.5 Job Tracker Manual

Features:

Manual logging of:

Company

Job title

Date applied

CX Fit Score at time of application

Stage

Supported stages include Applied, Interviewing, Offer, Closed.

Optional pipeline view grouped by stage.

CSV export.

No scraping or automated ingestion.

2.6 Interview Toolkit

Features:

STAR story library.

Morning of interview checklist tied to the target role.

Study packet builder that surfaces curated reading, video, and tool resources.

Interview question generator including:

Behavioral prompts

Role specific prompts

Leadership and impact prompts

Follow up message generator based strictly on user provided interview notes.

3. Baseline Expansion Interview

This module is a core differentiator and required in Beta v1.

3.1 Purpose

To support users who believe they are qualified despite a lower Fit Score by:

Conducting a structured AI guided interview.

Identifying underrepresented but real experience.

Validating responses through compliance checks.

Suggesting safe truthful additions to the baseline.

3.2 Trigger Points

The interview launches when:

User clicks “I think I’m qualified” on the Fit Review page.

System detects:

JD skills likely present in the user’s roles

Poor baseline coverage

Semantic similarity gaps

3.3 Gap Detection Engine

Inputs:

Parsed job requirements.

Baseline content.

Embedding similarity between JD items and baseline blocks.

Outputs:

For each gap:

Domain label.

Confidence level.

JD excerpt.

Related baseline excerpt if any.

3.4 Interview Flow

For each gap, the system asks probes including:

Direct experience.

Context.

Scope.

Tooling.

Impact.

Prompts must reference JD language explicitly when applicable.

3.5 Answer Validation and Ambiguity Handling

The Compliance Engine validates that:

Referenced companies exist in the baseline.

Timeframes align with known employment dates.

Metrics and outcomes are not fabricated.

Writing rules are enforced.

Responses that are empty, vague, or missing required context are marked non verifiable.

Non verifiable responses block promotion of additions.

Clarifying questions are optional in beta. Blocking promotion is mandatory.

3.6 Verified Additions Packet

After interview completion:

System produces suggested additions tied to real roles.

Displays:

Original Fit Score

Expanded Fit Score based on validated experience

User may approve or reject additions.

Approved additions create a new baseline version with a new hash.

4. Compliance Engine

Applies to all AI operations.

Rules enforced:

No fabricated experience.

No invented roles or companies.

No invented metrics.

No stylized punctuation.

Baseline hash required for all generation actions.

Full audit log for every generated artifact.

5. System Architecture Beta

Front end:

React and Next.js web application.

Back end:

Node with NestJS.

PostgreSQL primary datastore.

Optional Redis caching.

Storage:

S3-compatible object storage for hosted beta.

AI Layer:

Prompt orchestration.

Model routing.

Output validation.

Compliance wrapper.

Embeddings:

pgvector or OpenSearch.

6. Data Model Beta

Entities include:

Users.

Baselines.

Baseline Sections.

Baseline Versions.

Jobs.

Fit Assessments.

Interviews.

Job Tracker entries.

STAR Stories.

7. Beta Scope Boundaries

Included in beta:

Baseline Library.

Compatibility Check and Fit Review.

Tailored resume and cover letter generation.

Manual Job Tracker.

Interview Toolkit.

Baseline Expansion Interview.

Compliance Engine.

Explicitly excluded from beta:

Search Sets.

Mobile clients.

Desktop clients.

8. Conclusion

This specification defines a defensible, ethical, and audit safe career intelligence platform suitable for hosted beta deployment.

The Baseline Expansion Interview and Compliance Engine together form the primary competitive moat.

This document is the authoritative source of truth for Beta v1.
