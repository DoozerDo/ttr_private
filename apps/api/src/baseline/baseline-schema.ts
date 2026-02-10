import { z } from 'zod';

const IdentitySchema = z.object({
  full_name: z.string().trim().min(1).nullable().default(null),
  current_title: z.string().trim().min(1).nullable().default(null),
  current_company: z.string().trim().min(1).nullable().default(null),
  location: z.string().trim().min(1).nullable().default(null),
});

const ExperienceEntrySchema = z.object({
  company_name: z.string().trim().min(1),
  role_title: z.string().trim().min(1),
  start_date: z.string().trim().min(1).nullable().default(null),
  end_date: z.union([
    z.string().trim().min(1),
    z.literal('present'),
    z.null(),
  ]),
  scope_summary: z.string(),
  details_text: z.string().default(''),
});

const PeopleLeadershipSchema = z.object({
  direct_reports: z.number().nullable().default(null),
  managers_led: z.boolean().nullable().default(null),
  global_teams: z.boolean().nullable().default(null),
});

const OperationalOwnershipSchema = z.object({
  functions_owned: z.array(z.string()).default([]),
  process_design: z.boolean().nullable().default(null),
  process_scaling: z.boolean().nullable().default(null),
});

const OwnershipLevelSchema = z.enum([
  'used',
  'administered',
  'owned',
  'implemented',
  'unknown',
]);

const ToolingPlatformsSchema = z.object({
  tools: z.array(z.string()).default([]),
  ownership_level: OwnershipLevelSchema,
});

const CrossFunctionalSchema = z.object({
  product: z.boolean().nullable().default(null),
  engineering: z.boolean().nullable().default(null),
  sales_cs: z.boolean().nullable().default(null),
  executive: z.boolean().nullable().default(null),
});

const CustomerAdvocacySchema = z.object({
  executive_escalations: z.boolean().nullable().default(null),
  voice_of_customer: z.boolean().nullable().default(null),
  post_incident_rca: z.boolean().nullable().default(null),
});

const ScaleAndScopeSchema = z.object({
  customer_segment: z.enum(['smb', 'mid_market', 'enterprise', 'unknown']),
  geo_scope: z.enum(['regional', 'global', 'unknown']),
  org_stage: z.enum(['early', 'growth', 'public', 'unknown']),
});

const MetricsOutcomeSchema = z.object({
  metrics_present: z.boolean().default(false),
  metrics: z.array(z.string()).default([]),
});

const SkillsAndToolsSchema = z.object({
  tools: z.array(z.string()).default([]),
  methodologies: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
});

const LowConfidenceExtractionSchema = z.object({
  path: z.string(),
  reason: z.string(),
  snippet: z.string(),
});

const SystemGeneratedSchema = z.object({
  missing_fields: z.array(z.string()).default([]),
  ambiguity_flags: z.array(z.string()).default([]),
  low_confidence_extractions: z
    .array(LowConfidenceExtractionSchema)
    .default([]),
});

const CanonicalBaselineSchemaCore = z.object({
  identity: IdentitySchema,
  experience: z.array(ExperienceEntrySchema),
  people_leadership: PeopleLeadershipSchema,
  operational_ownership: OperationalOwnershipSchema,
  tooling_and_platforms: ToolingPlatformsSchema,
  cross_functional_partnership: CrossFunctionalSchema,
  customer_advocacy: CustomerAdvocacySchema,
  scale_and_scope: ScaleAndScopeSchema,
  metrics_and_outcomes: MetricsOutcomeSchema,
  skills_and_tools: SkillsAndToolsSchema,
  system_generated_read_only: SystemGeneratedSchema,
});

/**
 * Canonical baseline schema core.
 * This is what scoring, compliance, and generation consume.
 */
export const BaselineSchemaCore = CanonicalBaselineSchemaCore.extend({
  schema_version: z.string().default('baseline_schema_v1'),
  user_verified: z.boolean().default(false),
});

/**
 * Persisted baseline schema (adds storage metadata).
 */
export const BaselineSchema = BaselineSchemaCore.extend({
  baseline_id: z.string().uuid(),
  source_file_id: z.string().uuid(),
  source_format: z.enum(['docx', 'pdf']),
  ingested_at: z.string(),
});

export type BaselineSchemaCoreShape = z.infer<typeof BaselineSchemaCore>;
export type BaselineSchemaShape = z.infer<typeof BaselineSchema>;
