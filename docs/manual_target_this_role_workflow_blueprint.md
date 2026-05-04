# Manual Target This Role Workflow Blueprint

Audience: Junior developer implementing TargetThisRole

Purpose: Define the manual Target This Role workflow that has been proven through the local ChatGPT Resume project, so the app can be built toward the correct product behavior instead of guessing from incomplete code.

Status: Product source of truth for implementation planning

Last updated: May 3, 2026

## 1. Executive summary

TargetThisRole is not a generic AI resume writer.

It is a compliance gated career intelligence platform that helps a candidate target a specific job while staying fully truthful to their verified background.

The manual workflow works because it does three things at the same time:

1. It evaluates whether the candidate is a real fit for the role.
2. It interprets messy resume content into usable evidence without inventing facts.
3. It generates application materials only from what the baseline can support.

The app must eventually reproduce this behavior.

The most important rule is simple:

The system may interpret, organize, and strategically emphasize verified experience, but it must never fabricate, inflate, or invent experience.

## 2. Core product identity

TargetThisRole is built around one differentiator:

Compliance gated career intelligence that enforces verifiable truth.

The system must block or constrain unsupported claims, including invented companies, roles, metrics, tools, leadership scope, domain experience, certifications, dates, and outcomes.

The value is not that the app writes prettier resumes. The value is that it helps users represent themselves accurately while still competing effectively.

This creates a trust moat against generic AI resume tools.

## 3. What the manual workflow does today

The local ChatGPT Resume project workflow has a stable pattern.

1. The user provides a target role, usually as a job description or job posting.
2. The system reads the locked baseline resume that applies to that candidate.
3. The system performs a Compatibility Check with a CX Fit Score before generating materials.
4. The system gives a candid recommendation to apply, consider, or skip.
5. If the fit score is high enough, the system generates a tailored resume and cover letter inline.
6. Tailored materials must stay grounded in the locked baseline.
7. The system may adapt the summary and selected achievements to align with the role.
8. The system may not rewrite immutable baseline experience blocks unless explicitly allowed.
9. The system may not invent experience, metrics, scope, tools, responsibilities, certifications, or job titles.
10. The system must preserve factual integrity even when the job description asks for things the candidate does not have.

## 4. Locked baseline rule

A baseline resume is the exclusive source of truth for a candidate.

For Michael, the locked baseline for the Target This Role process has changed over time, but the current working rule is:

Use the locked baseline resume file specified for the current conversation or project as the exclusive source of truth.

For Dalen, the locked baseline in this conversation is the Dalen baseline resume file uploaded for the current workflow.

The implementation must support candidate specific baselines without assuming one global baseline applies to every user.

A baseline must be treated as verified evidence. It may be parsed, organized, summarized, and mapped to role requirements. It may not be embellished.

## 5. Immutable experience block rule

For Michael's workflow, experience sections from the locked baseline must be treated as immutable text blocks unless the user explicitly instructs otherwise.

That means:

1. Company names must not change.
2. Job titles must not change.
3. Dates must not change.
4. Core role descriptions must not be rewritten into unsupported claims.
5. Experience bullets must not be inflated.
6. Seniority must not be expanded beyond what the baseline supports.

The system may tailor these areas when allowed:

1. Resume header, if the baseline supports the information.
2. Professional summary.
3. Skills section, using only supported skills.
4. Selected achievements, if the claim already exists in the baseline.
5. Ordering, emphasis, and relevance of supported content.

The app should be designed so immutable sections can be enforced by candidate profile, baseline setting, or workflow configuration.

## 6. No fabrication rule

The system must never create facts that are not supported by the baseline or explicitly provided by the user.

The system must not invent:

1. Companies.
2. Job titles.
3. Employment dates.
4. Education.
5. Certifications.
6. Technical skills.
7. Tools.
8. Platforms.
9. Programming languages.
10. Team sizes.
11. Budget ownership.
12. Revenue ownership.
13. Cost savings.
14. Percent improvements.
15. Customer names.
16. Industry experience.
17. Domain experience.
18. Leadership scope.
19. Global scope.
20. Enterprise scope.
21. Strategic ownership.
22. Operational ownership.
23. Product ownership.
24. People management.
25. Cross functional influence.
26. Outcomes.
27. Awards.
28. Publications.
29. Security clearance.
30. Location.

If a detail is missing, the system must leave it out or ask for it in a guided improvement flow. It must not fill the gap by guessing.

## 7. Safe interpretation rule

The manual workflow does not simply keyword match. It interprets verified content.

Safe interpretation means the system may convert messy resume text into structured evidence when the meaning is clearly present.

Example source text:

Built and maintained backend services using Node.js, PostgreSQL, and AWS.

Allowed structured interpretation:

1. Action: built and maintained.
2. Domain: backend services.
3. Tools: Node.js, PostgreSQL, AWS.
4. Outcome: not stated.
5. Metrics: not stated.
6. Evidence strength: partial.
7. Use in generation: allowed with constraints.

Not allowed:

1. Claiming the user improved performance by 40 percent.
2. Claiming the user owned cloud architecture.
3. Claiming the user led a team.
4. Claiming the work was enterprise scale unless explicitly supported.

Safe interpretation is not hallucination. It is structured reading.

## 8. Evidence types

Every extracted or interpreted claim should be represented as evidence.

Each evidence item should include these fields where possible:

1. Source text.
2. Candidate.
3. Company.
4. Role title.
5. Time period.
6. Action.
7. Domain.
8. Tools.
9. Scope.
10. Outcome.
11. Metric.
12. Customer context.
13. Leadership context.
14. Source location in baseline.
15. Evidence source.
16. Evidence strength.
17. Support level.
18. Missing elements.
19. Generation use.
20. Compliance notes.

## 9. Evidence source values

Evidence source describes where the evidence came from.

Allowed values:

1. explicit

The claim appears clearly in the baseline.

2. inferred_from_resume_text

The claim is derived from baseline text without adding new facts.

3. user_provided

The user explicitly provided the information in the current workflow.

4. unavailable

No support exists.

Important rule:

User provided information can be used only if the user explicitly gives it. The app should preserve a record of the user provided source for audit purposes.

## 10. Evidence strength values

Evidence strength describes how usable an evidence item is.

1. strong

The baseline clearly states the action, context, and meaningful outcome or scope. Metrics may exist but are not required if the claim is otherwise specific.

2. partial

The baseline states meaningful work, tools, scope, domain, or outcome, but one or more elements are missing. Partial evidence is often usable in resume or cover letter content with constrained wording.

3. weak

The baseline contains vague responsibility language with little detail. Weak evidence can sometimes support general positioning but should not be used for strong achievement claims.

4. unusable

The baseline does not support the claim, or the text is too vague to responsibly use.

## 11. Support level values

Support level describes how directly the evidence supports a generated claim.

1. direct

The generated claim closely matches explicit baseline text.

2. partial

The generated claim is a careful reformulation of baseline text, with missing details omitted.

3. contextual

The baseline supports the general area but not a specific accomplishment.

4. none

The baseline does not support the claim.

Generated material must not include claims with support level none.

## 12. Missing elements values

Missing elements should be tracked instead of invented.

Common missing elements:

1. metrics.
2. scope.
3. outcome.
4. tools.
5. leadership_context.
6. customer_context.
7. timeframe.
8. business_impact.
9. technical_depth.
10. domain_context.

A missing element is not a blocker by itself. It is a constraint.

Example:

If metrics are missing, generate without metrics.

If leadership context is missing, do not claim leadership.

If customer context is missing, do not claim direct customer ownership.

## 13. Generation use values

Each evidence item should be classified for generation use.

1. use_directly

The evidence can be used as a generated claim with minimal change.

2. use_with_constraints

The evidence can be used, but the generated language must avoid unsupported details.

3. positioning_only

The evidence can support general summary language or skills alignment but not achievement bullets.

4. do_not_use

The evidence must not appear in generated materials.

## 14. Fit scoring is separate from evidence readiness

The CX Fit Score measures role compatibility.

Evidence and compliance checks are enforced during baseline creation and scoring.

After baseline creation + scoring, Studio is execution only: it must not introduce a second eligibility gate based on evidence readiness, template readiness, structured examples, or normalized model completeness.

If the system has a valid baseline and calculates a CX Fit Score of 80 or higher, the user is eligible for usable resume and cover letter generation.

The score must not be lowered to hide parser weakness. The app must not punish the candidate because the extraction pipeline failed.

## 15. CX Fit Score rule

Every Target This Role workflow must begin with a Compatibility Check and CX Fit Score.

The score should include:

1. A percentage from 0 to 100.
2. Fit label: Strong, Moderate, or Borderline.
3. Candid alignment analysis.
4. Gap analysis.
5. Final verdict.

The final verdict values are:

1. Apply.
2. Consider.
3. Skip.

For the established scoring rubric, the dimensions are:

1. Role scope and seniority, weight 25.
2. Support operations and process rigor, weight 25.
3. Tooling and platform experience, weight 20.
4. Domain and business context, weight 15.
5. Change leadership and customer advocacy, weight 15.

Known penalties:

1. Scope mismatch or downlevel, subtract 10.
2. Hard domain mismatch, subtract 5.

Rounding rule:

Use round half up for the final score only.

The score should remain candid. It should not be inflated to make the user feel better. It should not be lowered because generation readiness is weak.

## 16. Auto generation threshold rule

In the local workflow, scores above the configured threshold trigger automatic inline resume and cover letter generation.

Current rule:

If the Compatibility CX Fit Score is greater than 92 percent, automatically generate the inline tailored resume and cover letter without asking for confirmation.

Related rule:

For Michael's personal job search, scores over 85 should automatically trigger inline resume and cover letter generation.

Implementation note:

These thresholds may differ by candidate, workflow, or project setting. Do not hard code one universal threshold without configuration.

## 17. Apply, consider, skip behavior

Use this product behavior:

1. Apply

The role aligns strongly with the candidate's verified background. Generate materials when the user is eligible.

2. Consider

The role has meaningful alignment but notable gaps. The system may generate materials if it can do so truthfully, but should clearly name the gaps.

3. Skip

The role is a poor fit, too technical, too junior, too senior, or outside the target scope. The system should explain why and should not generate unless the user explicitly overrides and truthful generation is still possible.

## 18. Resume generation rules

Generated resumes must be concise, truthful, and targeted.

Rules:

1. Use only baseline supported facts.
2. Preserve locked titles.
3. Preserve locked companies.
4. Preserve locked dates.
5. Preserve chronological order from most recent to oldest.
6. Do not invent location.
7. Do not invent tools.
8. Do not invent metrics.
9. Do not invent domain experience.
10. Do not rewrite the candidate into a different career identity.
11. Emphasize the strongest verified match to the target role.
12. Deemphasize irrelevant areas when appropriate.
13. Keep metric formatting consistent, using numerals and percent signs where metrics are supported.
14. Do not include unsupported claims just because they appear in the job description.
15. Do not include deep technical infrastructure or NOC heavy positioning for Michael unless specifically requested, because his target scope is Customer Experience, Support Operations, or SaaS leadership.
16. For Michael, frame his background as a Customer Operations and Support Strategy leader, emphasizing systems built, operational architecture, cross functional influence, and less emphasis on tool lists.

## 19. Cover letter generation rules

Cover letters must be truthful, concise, and recruiter friendly.

Rules:

1. Always begin cover letters with: Dear Hiring Team,
2. Keep cover letters to one page unless the user explicitly requests otherwise.
3. Default length should be approximately 250 to 400 words.
4. Use only supported experience.
5. Do not invent a hiring manager name.
6. Do not invent company specific knowledge unless supplied by the job description or verified source.
7. Do not overstate leadership scope.
8. Do not use unsupported metrics.
9. Do not claim direct experience with tools or platforms unless supported.
10. Make the value proposition clear and practical.
11. Align to the role without sounding generic.

## 20. Writing style rules for generated materials

The user's established preference is to avoid dashes and stylized punctuation in professional materials.

Rules:

1. Do not use em dashes.
2. Do not use en dashes.
3. Avoid hyphenated constructions when a natural sentence can be used instead.
4. Use natural sentence structure.
5. Keep language human, direct, and recruiter friendly.
6. Avoid generic filler.
7. Avoid inflated executive language unless the baseline supports it.
8. Avoid buzzword stacking.
9. Avoid unsupported claims of transformation.
10. Avoid language that sounds machine generated.

## 21. File naming rules

When generating files, use this naming convention:

1. Resume: RoleNameResume.docx
2. Cover letter: RoleNameCover.docx

Do not ask the user about file naming again unless the user changes the rule.

## 22. Application log rule

The user wants a manual application log only.

Rules:

1. Add an application log entry only when the user explicitly says: log this application.
2. Include only verified details the user provides.
3. Allowed fields include company, role title, application date, and CX Fit Score.
4. Do not infer missing application details.
5. Do not automatically track applications.

## 23. Role targeting preferences

For Michael, future targeting should automatically exclude deep technical infrastructure or NOC heavy roles.

Target scope should focus on:

1. Customer Experience leadership.
2. Support Operations leadership.
3. SaaS leadership.
4. Customer Operations.
5. Support Strategy.
6. Operational architecture.
7. Cross functional influence.
8. Process rigor.
9. Escalation management.
10. Customer advocacy.

Avoid roles that are primarily:

1. Network operations center leadership.
2. Deep infrastructure engineering.
3. Hands on software engineering.
4. Security operations center work.
5. Pure IT operations.
6. Pure product management.
7. Roles requiring active certifications he does not have.
8. Roles requiring Salesforce certification, because he is not Salesforce certified.

## 24. Handling missing requirements from a job description

If the job requires something not present in the baseline, the system must name the gap honestly.

Example:

If the job requires Salesforce certification and the baseline does not show Salesforce certification, the system must say this is a gap.

It must not say the candidate is certified.

The system may say the candidate has adjacent experience only if the baseline supports it.

## 25. Manual workflow diagram

This diagram is written as plain text so it can be implemented without needing a diagram tool.

Step 1. User provides target role

Input may be a job description, job link, pasted posting, or role summary.

Step 2. Load locked baseline

Use the candidate specific baseline that has been locked for the workflow.

Step 3. Parse role requirements

Extract role title, seniority, responsibilities, required skills, preferred skills, domain context, tools, leadership scope, and deal breakers.

Step 4. Parse baseline

Extract companies, titles, dates, bullets, summary, skills, education, certifications, tools, metrics, scope, and raw text.

Step 5. Interpret baseline evidence

Convert messy resume text into structured evidence without adding facts.

Step 6. Score compatibility

Use the CX Fit Score rubric. This is compatibility, not generation readiness.

Step 7. Produce fit verdict

Return Strong, Moderate, or Borderline, plus Apply, Consider, or Skip.

Step 8. Evaluate evidence readiness

Compute evidence/readiness signals for quality and audit purposes, but do not use them as a Studio eligibility gate.

Step 9. Generate if allowed

Use strong evidence directly. Use partial evidence with constraints. Use weak evidence only for positioning. Do not use unsupported evidence.

Step 10. Audit the result

Record which evidence was used, how it was supported, what constraints applied, and what was omitted.

Step 11. Return materials or guidance

If the baseline is unusable, unreadable, unsupported, or unsafe, the workflow must fail before Studio.

Once a user reaches Studio with a valid baseline and CX Fit Score >= 80, generation and export must proceed. Any readiness/evidence/compliance diagnostics may be shown as non-blocking guidance only.

## 26. Ready, degraded, and blocked behavior

Readiness is not the same as scoring, and it is not a Studio gate.

1. Ready

There is enough strong and partial evidence to generate a truthful tailored resume and cover letter.

Behavior:

Generate materials normally. Include audit metadata internally.

2. Degraded

There is some usable verified evidence, but it is incomplete, thin, or missing metrics.

Behavior:

Allow generation. Use constrained language. Tell the user the draft is truthful but may be thinner in some areas. Provide targeted suggestions for improvement.

3. Blocked

The baseline is unusable, unreadable, unsupported, or unsafe and must be rejected before Studio.

Behavior:

Fail fast upstream (before Studio). Studio must not present a "generation blocked" state for users who have already passed baseline eligibility.

Critical rule:

Studio must not show "Generation is blocked" messaging due to missing structured examples or evidence readiness once baseline eligibility has been met (valid baseline + CX Fit Score >= 80).

## 27. Degraded generation message

When readiness is degraded, use language like this:

We found usable verified experience, but some areas are thin. We can generate truthful drafts using the strongest supported content. Add more detail later to improve quality.

This message is informational only and must not block generation or export in Studio once baseline eligibility is met.

## 28. Blocked generation message

When readiness is blocked, use language like this:

Generation is blocked because the baseline does not contain enough usable verified experience for this target role. Add specific experience, tools, outcomes, or scope details so the system can generate without inventing claims.

The system should also list the exact missing evidence categories.

This is an upstream (pre-Studio) failure mode. Studio must not enforce this as a second gate after baseline eligibility.

## 29. Constrained language rules

When evidence is partial, use careful language.

Allowed language when supported:

1. Supported.
2. Contributed to.
3. Built.
4. Maintained.
5. Helped improve.
6. Worked across.
7. Partnered with.
8. Coordinated.
9. Improved workflows.
10. Supported operations.

Avoid unless directly supported:

1. Transformed.
2. Owned global strategy.
3. Delivered measurable improvement.
4. Reduced costs.
5. Increased revenue.
6. Led enterprise wide transformation.
7. Architected the entire program.
8. Managed a global team.
9. Owned executive strategy.
10. Drove company wide change.

## 30. Audit metadata requirements

Every generated artifact should have an internal audit trail.

The audit should include:

1. Artifact type.
2. Target role.
3. Candidate baseline used.
4. Evidence items used.
5. Evidence strength for each item.
6. Evidence source for each item.
7. Support level for each item.
8. Generated claim supported by each item.
9. Constraints applied.
10. Missing elements.
11. Claims omitted due to insufficient support.
12. Compliance warnings.
13. Whether user provided details were used.
14. Whether generated material is ready or degraded.

The audit trail does not have to be prominent in the UI at first, but it must be testable.

## 31. Why this differs from generic AI resume writing

Generic AI resume tools often turn a job description into aspirational candidate language.

TargetThisRole must not do that.

The job description is the target.

The baseline is the truth.

The generated document is the truthful bridge between them.

The job description can influence emphasis and wording. It cannot create new experience.

## 32. Why this differs from keyword scoring

Keyword scoring can identify surface level alignment.

The manual workflow goes deeper.

It asks:

1. Does the candidate actually have relevant experience?
2. Is that experience senior enough?
3. Is the domain close enough?
4. Are the tools directly supported or adjacent?
5. Can the claim be made truthfully?
6. Can a recruiter understand the fit quickly?
7. Are the gaps manageable or disqualifying?

The app should eventually do all of this.

## 33. Parser expectations

The parser should extract structured data, but it should not be the only intelligence layer.

Resumes are messy. Many strong candidates do not write perfect structured accomplishment bullets.

The system must not treat weak parsing output as proof that the candidate lacks experience.

Parser output should feed an interpretation layer.

The interpretation layer should recover usable evidence from messy but legitimate resume content.

## 34. Evidence interpretation examples

Example 1.

Source:

Led global support operations and improved escalation workflows.

Interpretation:

1. Action: led.
2. Domain: support operations and escalation workflows.
3. Scope: global.
4. Outcome: improved workflows.
5. Metrics: missing.
6. Evidence strength: partial or strong depending on surrounding context.
7. Generation use: use with constraints.

Allowed generated claim:

Led global support operations with focus on escalation workflow improvement.

Not allowed:

Reduced escalation volume by 35 percent across global support operations.

Example 2.

Source:

Managed customer escalations across enterprise accounts.

Interpretation:

1. Action: managed escalations.
2. Customer context: enterprise accounts.
3. Domain: customer support or customer operations.
4. Metrics: missing.
5. Evidence strength: partial.
6. Generation use: use with constraints.

Allowed generated claim:

Managed escalations across enterprise customer accounts.

Not allowed:

Owned executive relationships for all enterprise customers.

Example 3.

Source:

Responsible for various engineering tasks.

Interpretation:

1. Action: unclear.
2. Domain: engineering.
3. Evidence strength: weak.
4. Generation use: positioning only or do not use.

Allowed generated claim:

May support general engineering background if needed.

Not allowed:

Built scalable distributed systems for production platforms.

## 35. Handling Dalen style baselines

A Dalen style baseline may contain legitimate technical experience but imperfect structure.

The system must not block generation simply because bullets are not perfectly structured.

Expected behavior:

1. Extract technical tools explicitly listed.
2. Extract action verbs from work history.
3. Extract project and domain context when present.
4. Mark missing outcomes or metrics honestly.
5. Produce partial evidence where appropriate.
6. Return degraded or ready when valid experience exists.
7. Avoid invented metrics, team size, or architectural ownership.

A score such as 82 can be valid even when generation readiness is degraded. The score should not be reduced just because the parser needs improvement.

## 36. User provided corrections

When the user corrects the system, the correction should be treated seriously.

Example:

If the user says Dalen's file should not be lower than 82, the system should not assume the user is asking for score inflation. It should investigate whether the parser or evidence pipeline is under reading the baseline.

The app should provide a way to capture corrected evidence, but only as user provided evidence with audit tracking.

## 37. No unsupported location inference

The system must not infer the candidate's location.

If the baseline does not include location, leave it blank or omit it.

If a job is location specific, mention location as a potential logistical issue only when relevant and supported.

## 38. Chronological order rule

Experience must be listed from most recent to oldest.

Do not reorder work history by relevance unless the user explicitly asks for a functional resume format.

## 39. Metrics rule

Metrics are powerful, but only when verified.

Allowed:

1. Use metrics that appear in the baseline.
2. Preserve metric meaning.
3. Format consistently.
4. Use numerals and percent signs where applicable.

Not allowed:

1. Inventing metrics.
2. Estimating metrics.
3. Rounding unsupported metrics.
4. Turning qualitative outcomes into quantified results.
5. Borrowing metrics from a job description.

## 40. Tool and platform rule

Only list tools and platforms supported by the baseline or explicitly provided by the user.

If the job requires a tool not in the baseline, the system may call it a gap.

If the baseline shows adjacent tools, the system may describe adjacent experience carefully.

Example:

If the role asks for Zendesk and the baseline shows Salesforce Service Cloud, the system may say the candidate has CRM and support operations platform experience if that is supported. It must not say the candidate has Zendesk experience.

## 41. Certification rule

Do not claim certifications unless they are in the baseline or explicitly provided by the user.

Known rule:

Michael is not Salesforce certified.

Therefore, the system must not claim Salesforce certification for Michael.

## 42. Role seniority rule

Do not inflate seniority.

If the candidate was a manager, do not call them a director.

If the candidate influenced cross functional work, do not claim executive ownership unless supported.

If the candidate supported strategy, do not claim they owned company strategy unless supported.

## 43. Customer Operations and Support Strategy framing rule

For Michael, the preferred positioning is:

Customer Operations and Support Strategy leader.

Emphasize:

1. Systems built.
2. Operational architecture.
3. Support operations.
4. Customer experience.
5. Cross functional influence.
6. Process rigor.
7. Escalation workflows.
8. Customer advocacy.
9. SaaS operational context.

Deemphasize:

1. Raw tool lists.
2. Deep technical infrastructure.
3. NOC heavy framing.
4. Pure IT operations.

## 44. Fit analysis output structure

The fit analysis should include:

1. Compatibility rating.
2. Fit label.
3. Final verdict.
4. Summary of why the role fits or does not fit.
5. Experience alignment.
6. Leadership level alignment.
7. Technical or platform fit.
8. Industry or context fit.
9. Strategic versus tactical balance.
10. Gaps and risks.
11. Recommendation.

The tone should be candid. Do not flatter the user. Do not bury serious gaps.

## 45. High score generation rule

When the score crosses the applicable auto generation threshold, generate resume and cover letter inline automatically.

Do not ask for confirmation unless:

1. The baseline is missing.
2. The target role is missing.
3. The candidate identity is unclear.
4. The user explicitly asks for analysis only.
5. Baseline creation/scoring failed because the baseline was unusable, unreadable, unsupported, or unsafe (this must be resolved before Studio).

## 46. When not to generate

Do not generate when:

1. There is no locked baseline available.
2. The target role is not available.
3. The candidate is a poor fit and generation would misrepresent them.
4. The user requests no generation.
5. The role requires unsupported must have experience that cannot be truthfully bridged.
6. Baseline creation/scoring failed or was rejected upstream (pre-Studio).

## 47. Guided improvement behavior

When generation is degraded or blocked, the system should help the user improve the baseline.

Note: any blocked state must be determined upstream (before Studio). Studio must not act as a second eligibility gate after baseline eligibility has been met (valid baseline + CX Fit Score >= 80).

Ask for targeted details, not vague requests.

Good prompt:

Add one specific example of a customer escalation you handled, including the customer type, your action, and the outcome. Include metrics only if you know they are accurate.

Bad prompt:

Tell me more about your experience.

The goal is to improve verified evidence without encouraging exaggeration.

## 48. Compliance language for user interface

The app should explain constraints in a helpful way.

Good language:

We can use this experience, but the baseline does not include metrics, so the draft will avoid quantified claims.

Bad language:

Your resume is not good enough.

Good language:

This role is a fit, but the current baseline is thin in platform specific evidence.

Bad language:

Generation failed.

## 49. Junior developer mental model

Think of the system as four separate engines.

Engine 1. Role parser

Reads the job description and extracts what the employer wants.

Engine 2. Baseline evidence engine

Reads the candidate baseline and extracts what is true about the candidate.

Engine 3. Fit scoring engine

Compares the role to the candidate and calculates compatibility.

Engine 4. Artifact generation engine

Writes materials using only supported evidence.

Do not merge these engines into one vague prompt.

Each engine needs inputs, outputs, tests, and audit behavior.

## 50. Recommended data flow

1. TargetRoleInput enters the system.
2. CandidateBaseline is loaded.
3. RoleParser creates RoleRequirementSet.
4. BaselineParser creates ParsedBaseline.
5. EvidenceInterpreter creates EvidenceItem array.
6. FitScorer creates CompatibilityResult.
7. ReadinessEvaluator creates ArtifactReadinessResult.
8. Generator creates ResumeDraft and CoverLetterDraft if allowed.
9. AuditBuilder creates ArtifactAudit.
10. Studio displays results and execution controls based on baseline eligibility (valid baseline + CX Fit Score >= 80). Readiness is informational only and must not block generation or export in Studio once eligibility is met.

## 51. Suggested TypeScript style interfaces

These are conceptual and may be adapted to the existing codebase.

```ts
export type EvidenceSource =
  | 'explicit'
  | 'inferred_from_resume_text'
  | 'user_provided'
  | 'unavailable';

export type EvidenceStrength =
  | 'strong'
  | 'partial'
  | 'weak'
  | 'unusable';

export type SupportLevel =
  | 'direct'
  | 'partial'
  | 'contextual'
  | 'none';

export type GenerationUse =
  | 'use_directly'
  | 'use_with_constraints'
  | 'positioning_only'
  | 'do_not_use';

export type MissingElement =
  | 'metrics'
  | 'scope'
  | 'outcome'
  | 'tools'
  | 'leadership_context'
  | 'customer_context'
  | 'timeframe'
  | 'business_impact'
  | 'technical_depth'
  | 'domain_context';

export interface EvidenceItem {
  id: string;
  sourceText: string;
  sourceLocation?: string;
  candidateId?: string;
  company?: string;
  roleTitle?: string;
  timeframe?: string;
  action?: string;
  domain?: string;
  tools?: string[];
  scope?: string;
  outcome?: string;
  metric?: string;
  customerContext?: string;
  leadershipContext?: string;
  evidenceSource: EvidenceSource;
  evidenceStrength: EvidenceStrength;
  supportLevel: SupportLevel;
  missingElements: MissingElement[];
  generationUse: GenerationUse;
  complianceNotes: string[];
}

export interface CompatibilityResult {
  score: number;
  fitLabel: 'Strong' | 'Moderate' | 'Borderline';
  verdict: 'Apply' | 'Consider' | 'Skip';
  dimensions: Array<{
    name: string;
    weight: number;
    score: number;
    rationale: string;
  }>;
  gaps: string[];
  recommendation: string;
}

export interface ArtifactReadinessResult {
  status: 'ready' | 'degraded' | 'blocked';
  reasons: string[];
  strongEvidenceCount: number;
  partialEvidenceCount: number;
  weakEvidenceCount: number;
  unusableEvidenceCount: number;
  missingElements: MissingElement[];
}

export interface ArtifactAudit {
  artifactType: 'resume' | 'cover_letter';
  targetRoleId?: string;
  baselineId: string;
  readinessStatus: 'ready' | 'degraded' | 'blocked';
  usedEvidence: Array<{
    evidenceId: string;
    generatedClaim: string;
    evidenceStrength: EvidenceStrength;
    evidenceSource: EvidenceSource;
    supportLevel: SupportLevel;
    constraintsApplied: string[];
  }>;
  omittedClaims: Array<{
    requestedClaim: string;
    reason: string;
  }>;
  complianceWarnings: string[];
}
```

## 52. Readiness evaluator rules

Readiness should be centralized. Do not scatter magic numbers.

Suggested behavior:

1. Ready when there is enough strong and partial evidence to generate truthful materials.
2. Degraded when there is some usable evidence but important gaps remain.
3. Blocked only when no meaningful usable evidence exists.

Important:

Partial evidence should unlock degraded generation. It should not be treated as zero.

Weak evidence should not unlock full generation by itself.

Unusable evidence should not unlock generation.

## 53. Generator behavior by evidence strength

Strong evidence:

Use directly, preserving meaning.

Partial evidence:

Use with constrained language. Do not add missing metrics, missing scope, or missing outcomes.

Weak evidence:

Use only for general positioning if needed. Avoid achievement bullets.

Unusable evidence:

Do not use.

## 54. Resume bullet construction rules

A strong resume bullet usually contains:

1. Action.
2. Scope or context.
3. Outcome.
4. Metric when available.

If a metric is missing, the bullet can still exist, but it must not pretend a metric exists.

Example with metric:

Improved escalation response workflow by 25 percent through clearer routing and ownership standards.

Only allowed if the 25 percent metric is verified.

Example without metric:

Improved escalation response workflows by clarifying routing, ownership, and cross functional handoff standards.

Allowed if those facts are supported.

## 55. Cover letter construction rules

The cover letter should connect the candidate's verified background to the employer's needs.

Structure:

1. Greeting: Dear Hiring Team,
2. Opening paragraph with role alignment.
3. Middle paragraph with two or three strongest verified themes.
4. Optional second middle paragraph for role specific alignment.
5. Closing paragraph with interest and confidence.

Do not over explain gaps in the cover letter unless necessary.

Do not include unsupported claims.

## 56. Handling job description language

The job description provides target language, not candidate facts.

Allowed:

1. Mirror role terminology when the baseline supports the concept.
2. Prioritize relevant baseline evidence.
3. Identify gaps.
4. Use employer needs to decide emphasis.

Not allowed:

1. Copying job requirements into the resume as if the candidate has them.
2. Claiming required tools that are absent from the baseline.
3. Claiming required certifications that are absent from the baseline.
4. Claiming leadership scope only because the job asks for it.

## 57. Search sets rule

When the user says run search sets, the process should include generating a curated list of 5 to 10 closest matching roles with full links and scope summaries.

This is a separate workflow from targeting one role, but it should use the same candidate positioning and fit principles.

## 58. Manual workflow examples for product behavior

Example A. Strong role fit, strong evidence

Input:

Role asks for Support Operations leadership, escalation process improvement, cross functional collaboration, SaaS experience.

Baseline shows:

Senior Manager, Customer Operations, support operations leadership, escalation workflows, SaaS context, cross functional teams.

Expected behavior:

1. High CX Fit Score.
2. Apply verdict.
3. Ready generation.
4. Resume emphasizes Customer Operations, escalation workflows, operational architecture, and cross functional leadership.
5. Cover letter begins Dear Hiring Team,
6. No invented metrics.

Example B. Strong role fit, weak parser output

Input:

Role asks for software development experience.

Baseline has legitimate technical work but the parser extracts only sparse text.

Expected behavior:

1. Score may still be strong or moderate if role alignment is real.
2. Evidence interpreter should recover partial evidence from raw text.
3. Readiness should be degraded, not blocked, if usable evidence exists.
4. Generation should use cautious language.
5. Audit should show missing metrics or outcomes.

Example C. Poor role fit

Input:

Role requires hands on Kubernetes platform engineering, SRE ownership, and current cloud infrastructure leadership.

Baseline does not support those areas.

Expected behavior:

1. Lower CX Fit Score.
2. Skip or Consider verdict depending on adjacent evidence.
3. Do not generate materials that pretend the candidate is an SRE or infrastructure leader.
4. Explain gaps clearly.

## 59. Testing blueprint

The app needs tests for every engine.

Role parser tests:

1. Extract required skills.
2. Extract preferred skills.
3. Extract seniority.
4. Extract tools.
5. Extract certifications.
6. Extract domain.
7. Extract deal breakers.

Baseline parser tests:

1. Extract companies.
2. Extract titles.
3. Extract dates.
4. Extract bullets.
5. Extract tools.
6. Extract education.
7. Extract certifications.
8. Preserve raw text.

Evidence interpreter tests:

1. Messy valid resume text becomes partial usable evidence.
2. Explicit metric bullet becomes strong evidence.
3. Vague responsibility text becomes weak evidence.
4. Unsupported metric is not created.
5. Unsupported leadership scope is not created.
6. Missing elements are populated.
7. Tools are extracted only when present.

Fit scoring tests:

1. Score uses configured dimension weights.
2. Score applies downlevel penalty when appropriate.
3. Score applies hard domain mismatch penalty when appropriate.
4. Score uses round half up only for final score.
5. Score does not change because readiness is degraded.

Readiness tests:

1. Strong evidence returns ready.
2. Strong plus partial evidence returns ready when threshold is met.
3. Partial evidence returns degraded.
4. Weak evidence alone does not return ready.
5. Unusable evidence returns blocked.
6. Valid experience greater than zero with partial evidence does not return blocked.

Resume generation tests:

1. Strong evidence is used accurately.
2. Partial evidence is used without invented metrics.
3. Weak evidence is not used as an achievement bullet.
4. Unsupported job description requirements are not copied into the resume.
5. Chronological order is preserved.
6. Titles, companies, and dates are preserved.
7. No unsupported tools appear.
8. No unsupported certifications appear.

Cover letter generation tests:

1. Starts with Dear Hiring Team,
2. Stays within one page target length.
3. Uses only supported evidence.
4. Does not invent hiring manager name.
5. Does not claim unsupported company knowledge.
6. Does not add unsupported metrics.

Audit tests:

1. Every generated claim maps to evidence.
2. Evidence strength is included.
3. Evidence source is included.
4. Support level is included.
5. Constraints are included.
6. Omitted claims are included.
7. Compliance warnings are included when relevant.

Studio UI tests:

1. Ready shows generation actions.
2. Degraded shows generation actions.
3. Degraded does not show Generation is blocked.
4. Degraded shows helpful caution language.
5. Blocked hides generation actions.
6. Blocked shows missing evidence guidance.

Regression tests:

1. Dalen style baseline with legitimate but imperfect technical experience should not be blocked when partial evidence exists.
2. Michael style Customer Operations role should produce appropriate CX Fit Score and truthful materials.
3. Salesforce certification must not be invented.
4. Location must not be inferred.
5. Deep infrastructure roles should be penalized or flagged for Michael when outside target scope.

## 60. Implementation phases

Phase 1. Add this blueprint to the repo

Create docs/manual_target_this_role_workflow_blueprint.md or equivalent.

Phase 2. Current state inventory

Have Codex inspect the repo and map current files to this blueprint.

Output should include:

1. Current role parser path.
2. Current baseline parser path.
3. Current scoring path.
4. Current readiness path.
5. Current resume generation path.
6. Current cover letter generation path.
7. Current audit path if any.
8. Missing pieces.
9. Incorrect assumptions in current code.

Phase 3. Fixtures

Create representative fixtures before implementation.

Fixtures should include:

1. Michael Customer Operations baseline.
2. Dalen technical baseline.
3. Strong support operations role.
4. Moderate adjacent role.
5. Poor fit infrastructure role.
6. Role requiring unsupported certification.

Phase 4. Evidence model

Add the evidence item model, source values, strength values, support levels, missing elements, and generation use values.

Phase 5. Evidence interpreter

Build deterministic interpretation from parsed baseline and raw text.

Phase 6. Readiness evaluator

Update readiness to support ready, degraded, and blocked based on usable evidence.

Phase 7. Resume constrained generation

Update resume generation to use evidence strength and constraints.

Phase 8. Cover letter constrained generation

Update cover letter generation to use evidence strength and constraints.

Phase 9. Audit metadata

Add artifact audit output.

Phase 10. Studio UI

Update ready, degraded, and blocked display behavior.

Phase 11. Full regression suite

Run focused tests first, then broader builds.

## 61. Codex instruction pattern for future work

When asking Codex to implement against this blueprint, use this structure:

```text
Read docs/manual_target_this_role_workflow_blueprint.md first.

Treat that document as the product source of truth.

Do not assume the existing repo architecture is correct.

Inspect the current implementation and map it to the blueprint before changing code.

Implement only the requested phase.

Do not change scoring unless the phase explicitly says to change scoring.

Do not invent candidate facts.

Do not weaken compliance.

Add focused tests for the phase.

Return files changed, behavior changed, tests added, commands run, pass or fail results, and remaining gaps.
```

## 62. First recommended Codex prompt after adding this blueprint

Use this after the blueprint is committed or added to the repo.

```text
Read docs/manual_target_this_role_workflow_blueprint.md first. Treat it as the product source of truth.

This pass is current state inventory only. Do not change production behavior yet.

Goal:
Map the current repo implementation to the manual Target This Role workflow blueprint.

Tasks:
1. Identify current files and services responsible for role parsing, baseline parsing, fit scoring, artifact readiness, resume generation, cover letter generation, Studio UI behavior, and audit metadata.
2. Identify where the current app matches the blueprint.
3. Identify where the current app diverges from the blueprint.
4. Identify missing abstractions, especially evidence interpretation, constrained generation, degraded readiness, and audit metadata.
5. Identify brittle or duplicated logic.
6. Identify the smallest safe first implementation phase.
7. Create a repo document named docs/target_this_role_current_state_inventory.md with findings.

Constraints:
1. Do not change scoring.
2. Do not change parser behavior.
3. Do not change readiness behavior.
4. Do not change generation behavior.
5. Do not change Studio UI behavior.
6. Do not add production code.
7. Do not add tests yet unless needed to document current behavior.

Return:
1. Files inspected.
2. Current implementation paths found.
3. Missing pieces compared to the blueprint.
4. Inventory document created.
5. Recommended next implementation prompt.
```

## 63. Product truth to preserve

The app should feel like the manual process because both are governed by the same truth:

The candidate's baseline is the truth.

The job description is the target.

The system's job is to build the strongest truthful bridge between them.

When the system lacks evidence, it should constrain or ask. It should not invent.

When the parser is weak, the system should improve interpretation. It should not punish the candidate.

When the role is not a fit, the system should say so.

When the role is a fit, the system should help the candidate compete without lying.
