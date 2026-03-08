Archived: not part of the current beta source of truth.

TARGET THIS ROLE™ — APPLICATION SPECIFICATION v1.0

Last updated: November 2025

1. PRODUCT OVERVIEW

Target This Role is a precision career-intelligence platform that:

Scores a candidate’s alignment to any job posting

Generates compliance-validated résumés and cover letters

Surfaces personalized job opportunities

Provides interview preparation tools

And uniquely conducts an AI-guided Baseline Expansion Interview
(to identify missing or underrepresented real experience and improve Fit Scores truthfully)

The platform emphasizes truth, auditability, and zero fabrication through an internal Compliance Engine.

Designed for job seekers, career coaches, recruiters, and outplacement programs.

Supports: Web, iOS, Android, macOS, Windows.

2. CORE USER MODULES
2.1 Target This Role (Core Flow)
Features:

Job Description Ingestion

Paste text or provide URL

Automatic HTML extraction for job links

JD normalized into Responsibilities and Requirements

Compatibility Check (CX Fit Score)

0 to 100 percent scoring

Five-category breakdown:

Experience alignment

Leadership level

Technical platform fit

Industry & context

Strategic vs tactical fit

Verdict: Apply, Consider, Skip

Fit Review Page

Shows CX Fit Score

Alignment strengths & gaps

Compliance flags

Trigger: “I think I’m qualified” (leads to Baseline Expansion Interview)

2.2 Baseline Library
Features:

Upload locked baseline résumé (.docx or .pdf)

Automatic parsing into:

Summary

Experience blocks

Programs / projects

Skills

Education

Immutable content blocks with hash verification

Versioning system (each baseline is versioned with a cryptographic hash)

Tag blocks as:

Always include

Optional include

Never include

This ensures all tailoring is grounded in the user’s verified experience.

2.3 Tailored Résumé Generator
Features:

Select a baseline version

Select which blocks to include

Auto-generate a Targeted Résumé that:

Stays within factual scope

Preserves ordering (most recent → oldest)

Uses writing rules (no stylized punctuation etc.)

Exports:

DOCX

PDF

Compliance Validations:

No new roles

No invented achievements

No fictional technologies

No scope inflation

If Fit Score ≥ 92 percent, résumé generation becomes one-tap.

2.4 Cover Letter Studio
Features:

One-page limit

Locked opening line: “Dear Hiring Team,”

Body paragraphs use only baseline-verified achievements

Closing paragraph template (configurable by user)

Compliance:

No invented scope

No invented metrics

No unknown companies or roles

2.5 Job Tracker (Manual)
Features:

Log application details:

Company

Title

Date applied

CX Fit Score at time of application

Stage (Applied, Interviewing, Offer, Closed)

Export to CSV

Optional pipeline view

No scraping. User-controlled data.

2.6 Interview Toolkit
Features:

STAR Story Library

Morning Of Interview Flow

Study Packet Builder:

AI suggests reading/video resources

Interview question generator:

Behavioral

Role-specific

Leadership-specific

Follow-up message generator:

Based strictly on interview notes

3. NEW MODULE: BASELINE EXPANSION INTERVIEW

This module is a major differentiator and must be included in v1.0.

3.1 Purpose

To support users who receive a lower Fit Score but believe they are qualified by:

Conducting an AI-driven structured interview

Identifying underrepresented real experience

Validating accuracy through compliance checks

Suggesting safe, truthful additions to the baseline

This increases user retention and conversion, and makes the product far more intelligent than competitors.

3.2 Trigger Points

After Fit Score is shown, user taps:
“I think I’m qualified”

The system detects:

JD mentions skills likely present in user’s roles

Baseline coverage is poor or incomplete

Clusters of semantically similar but missing experience

3.3 Gap Detection Engine
Inputs:

Parsed JD requirements

Baseline content

Embedding similarity between JD items and resume blocks

Output:

A list of suspected gaps, each tagged with:

Domain (e.g., Observability, Incident Command)

Confidence level

Example JD excerpts

Related baseline excerpts

3.4 Interview Flow

For each identified gap, the system asks targeted questions:

Question Types:

Direct Experience Probe

Context Probe

Scope Probe

Tooling Probe

Impact Probe

Examples:

“The JD expects experience in SRE observability. Did you ever own or drive monitoring or alerting workflows? If so, at which company and in what role?”

“The JD references KPI dashboards. Did you create or manage any dashboards at CenturyLink, iStreamPlanet, Starbucks, or SentinelOne?”

“Did you participate in any cross-functional incident reviews or root-cause retrospectives? Where and in what capacity?”

3.5 Answer Validation via Compliance Engine
Validates:

References known companies only

Timeframes match real employment dates

No invented metrics or fabricated outcomes

Writing rules enforced (no stylized punctuation)

If ambiguous:

System asks clarifying questions

Or flags the answer as non-verifiable

3.6 Verified Additions Packet

After the interview is complete:

Creates:

Structured additions tied to real past roles

Suggested resume bullets (non-inflated)

Updated Fit Score:

Original Score

Expanded Score (“based on validated experience”)

User choice:

“Add these items to my baseline”

Or “Keep baseline as-is”

Result:

If approved → new baseline version created with new hash

Used in future tailoring and scoring

4. COMPLIANCE ENGINE (Core Differentiator)

Applies to all AI operations.

Rules Enforced:

No made-up experience

No invented roles

No fabricated metrics

No new companies

No stylized punctuation

Baseline hash required for all tailoring actions

Full audit log per artifact generated

This is what makes the product marketable as premium, ethical career AI.

5. SYSTEM ARCHITECTURE
5.1 High-Level Architecture

Front-end:

Web (React)

Mobile (React Native via Expo)

Desktop (Tauri wrapper)

Back-end:

Node/NestJS or Go

Postgres

Redis (optional caching)

S3-compatible storage

pgvector or OpenSearch for embeddings

AI Layer:

Prompt Orchestrator

Model Router

Output Validator

Compliance Engine wrapper

6. DATA MODEL (Condensed)
Users

id

email

role (user/coach/admin)

subscription tier

Baselines

id

user_id

version

hash

file paths

Baseline Sections

id

baseline_id

type

content

include_policy

order_index

Jobs

id

user_id

company

title

raw_jd

parsed_jd

Fit Assessments

id

job_id

score

verdict

dimension breakdown

Interviews (New Module)

id

job_id

gap_list

questions json

responses json

validation_results json

recommended_additions

Baseline Versions

id

baseline_id

version

timestamp

hash

diff json

Job Tracker

id

job_id

stage

notes

applied_date

STAR Stories

id

fields…

7. PLATFORM ROADMAP (v1 → v3)
v1.0 (MVP launch)

Required for launch:

Baseline Library

Compatibility Check

Tailored Résumé Generator

Cover Letter Studio

Job Tracker

Baseline Expansion Interview

Compliance Engine

Web app

Export docx/pdf

v2.0

Interview Toolkit

Mobile apps

Desktop apps

v3.0

Coach workspace

White-label offering

Enterprise SSO

Outplacement workflow

8. REVENUE MODEL

Free Tier

Limited Fit Scores

Limited tailoring

No Baseline Expansion Interview

Pro ($12–$15/mo)

Unlimited Fit Scores

Unlimited tailoring

Full Baseline Expansion Interview

Interview Toolkit

Job Tracker

Coach Tier ($49–$79/mo)

Manage up to 10 users

White-label exports

Interview transcripts

Private baselines

Enterprise Tier ($10k–$50k annually)

SSO

Outplacement workflow

Admin dashboard

Reporting

Bulk user management

9. GO-TO-MARKET STRATEGY

Direct-to-consumer via:

TikTok

YouTube Shorts

LinkedIn influencers

SEO

Career coaches

Partnerships with resume writers

Licensing tools to career bootcamps

Enterprise outplacement programs

Corporate HR

Tech layoff cycles

Internal mobility programs

University partnerships (later)

MBA programs

Tech schools

Resume workshops

10. CONCLUSION

This product specification outlines a defensible, differentiated, premium career-intelligence platform.
The Baseline Expansion Interview is fully integrated as a core v1.0 feature and represents a strong competitive moat.

The Compliance Engine and Baseline System ensure factual, audit-safe AI output — enabling legitimate enterprise adoption.

This spec is ready for:

Founding engineers

Potential CTOs

Investors

Development agencies

