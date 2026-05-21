import 'reflect-metadata';
import path from 'path';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { AccountType } from '../users/account-type.enum';
import { SubscriptionTier } from '../subscription/subscription-tier.enum';
import { User } from '../users/user.entity';
import {
  Baseline,
  BaselineStatus,
} from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineParsed } from '../baseline/baseline-parsed.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';

dotenv.config({
  path: path.resolve(__dirname, '../../.env.development.local'),
});

const SEED_USER_EMAIL = 'local-score-seed@targetthisrole.test';
const SEED_USER_PASSWORD = 'LocalScore123!';
const BASELINE_SCENARIO_KEY = 'local-score-seed-baseline';
const BASELINE_HASH = 'local-score-baseline-v2';
const JOB_EXTERNAL_ID = 'local-score-seed-job';
const JOB_TITLE = 'Local scoring validation role';

const baselineSectionContents = [
  {
    sectionType: BaselineSectionType.SUMMARY,
    title: 'Professional summary',
    content:
      // Keep this short: scoring's canonical baseline summary uses identity-line fields
      // (name/title/company/location). A long narrative here inflates "original baseline"
      // text and reduces baseline coverage percent during scoring.
      'Local Validator | Senior Support Operations Manager | TargetThisRole Test | Remote',
  },
  {
    sectionType: BaselineSectionType.EXPERIENCE,
    title: 'Recent experience highlights',
    content:
      'Owned support operations for a B2B SaaS platform across incident, problem, and change management. Led weekly change advisory board (CAB) reviews, authored runbooks, and drove post-incident RCA facilitation with engineering and customer success. Built automated ticket workflows and on-call coordination to improve SLA adherence and reduce escalations.\n\nLed cross-functional incident response for high-severity outages, coordinating stakeholder communications, executive updates, and customer-facing follow-ups. Partnered with engineering on observability improvements (dashboards, alerts) and implemented operational automation to reduce manual toil. Created measurement plans and reporting dashboards tracking MTTR, ticket backlog, SLA compliance, and escalation trends.\n\nEvidence aligned to this role:\n- Incident management, on-call coordination, and stakeholder communications for Sev1/Sev2 events.\n- Change management and release readiness checkpoints (CAB), including risk assessment and approvals.\n- Problem management with structured RCAs and corrective/preventive actions.\n- Process improvement, operational rigor, and automation (ticket routing, SLAs, runbooks).\n- Tooling: ticketing systems (e.g., Jira/ServiceNow), observability dashboards, alerting, and knowledge bases.\n- People leadership: mentored analysts, coordinated cross-functional teams, and partnered with engineering and customer success.',
  },
];

const jobDescription = `
We are hiring a Senior Support Operations Manager to own incident management, change management, and automation for a critical B2B SaaS platform. You will partner with engineering, customer success, and leadership to run on-call processes, reduce escalations, and improve operational rigor. The ideal candidate has experience building runbooks, coordinating high-severity incidents, leading RCAs, and driving process improvements that measurably reduce MTTR and ticket backlog.

Responsibilities include managing the incident lifecycle (Sev1/Sev2), coordinating stakeholder communications and executive updates, and ensuring customer follow-up and corrective actions are tracked. You will lead change advisory board (CAB) processes, release readiness checkpoints, and risk reviews. You will build measurement plans and dashboards for SLAs, MTTR, backlog, and escalation trends, and drive operational automation to reduce manual toil.

The candidate will also mentor analysts and support engineers, collaborate with engineering on observability improvements (alerts, dashboards), and maintain a high-quality knowledge base. Experience with ticketing tools (Jira Service Management or ServiceNow), incident tooling, and an ITIL-aligned approach to problem/change management is strongly preferred.
`;

const jobResponsibilities = [
  'Own incident management (Sev1/Sev2), on-call coordination, and stakeholder communications for a B2B SaaS platform.',
  'Lead problem management by facilitating RCAs and tracking corrective and preventive actions through completion.',
  'Run change management processes including CAB reviews, risk assessment, approvals, and release readiness checkpoints.',
  'Build and maintain runbooks, operational playbooks, and a knowledge base for support and incident response.',
  'Create measurement plans and dashboards tracking SLAs, MTTR, ticket backlog, escalation trends, and operational health.',
  'Drive operational automation to reduce manual toil, improve ticket routing, and increase first-contact resolution.',
  'Partner with engineering on observability improvements including dashboards, alerts, and incident detection coverage.',
  'Collaborate with customer success on escalation management, customer follow-up, and executive communication during incidents.',
  'Mentor analysts and support engineers on operational rigor, incident response best practices, and process adherence.',
  'Continuously improve processes and tooling through retrospectives, root cause trends, and structured improvement plans.',
];

const jobRequirements = [
  'Demonstrated experience in support operations, incident management, and ITIL-aligned problem/change management for SaaS environments.',
  'Experience leading high-severity incident response with clear stakeholder communications and executive-ready updates.',
  'Proven ability to drive process improvement and operational rigor with measurable outcomes (e.g., MTTR, SLA compliance, backlog reduction).',
  'Hands-on experience with ticketing tools (Jira Service Management or ServiceNow) and building automation/workflows within them.',
  'Experience partnering with engineering on observability (dashboards, alerts) and reliability improvements.',
  'Ability to mentor and lead a small team (analysts/support engineers) while coordinating cross-functional stakeholders.',
  'Strong written communication skills for runbooks, postmortems/RCAs, and customer-facing incident follow-ups.',
  'Experience building and maintaining reporting dashboards for operational metrics and trend analysis.',
];

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
  entities: [path.resolve(__dirname, '../**/*.entity.{ts,js}')],
  // Seeding does not need migrations, and the migrations directory may contain non-migration
  // TS files (e.g. *.spec.ts) that break ts-node execution.
  migrations: [],
  synchronize: false,
});

async function ensureUser(): Promise<User> {
  const repository = dataSource.getRepository(User);
  let user = await repository.findOne({ where: { email: SEED_USER_EMAIL } });
  if (user) {
    const needsProfile =
      !user.profileCompletedAt ||
      !user.roleTitle?.trim() ||
      !user.intendedUse?.trim();

    if (needsProfile) {
      user = repository.merge(user, {
        roleTitle: user.roleTitle?.trim()
          ? user.roleTitle
          : 'Senior Support Operations Manager',
        intendedUse: user.intendedUse?.trim() ? user.intendedUse : 'job_search',
        profileCompletedAt: user.profileCompletedAt ?? new Date(),
        subscriptionTier: SubscriptionTier.PRO,
        accountType: AccountType.PAID,
      });
      user = await repository.save(user);
      console.log(`Updated seeded user profile fields: ${user.id}`);
      return user;
    }

    if (user.subscriptionTier !== SubscriptionTier.PRO || user.accountType !== AccountType.PAID) {
      user = repository.merge(user, {
        subscriptionTier: SubscriptionTier.PRO,
        accountType: AccountType.PAID,
      });
      user = await repository.save(user);
    }

    console.log(`User already exists: ${user.id}`);
    return user;
  }

  const passwordHash = await bcrypt.hash(SEED_USER_PASSWORD, 10);
  user = repository.create({
    email: SEED_USER_EMAIL,
    firstName: 'Local',
    lastName: 'Validator',
    passwordHash,
    emailConfirmed: true,
    roleTitle: 'Senior Support Operations Manager',
    intendedUse: 'job_search',
    profileCompletedAt: new Date(),
    role: 'user',
    subscriptionTier: SubscriptionTier.PRO,
    accountType: AccountType.PAID,
  });

  user = await repository.save(user);
  console.log(`Created user ${user.email} id=${user.id}`);
  return user;
}

async function ensureBaseline(userId: string): Promise<Baseline> {
  const baselineRepository = dataSource.getRepository(Baseline);
  const sectionRepository = dataSource.getRepository(BaselineSection);
  const parsedRepository = dataSource.getRepository(BaselineParsed);
  const versionRepository = dataSource.getRepository(BaselineVersion);

  let baseline = await baselineRepository.findOne({
    where: {
      userId,
      syntheticScenarioKey: BASELINE_SCENARIO_KEY,
    },
  });
  if (!baseline) {
    baseline = await baselineRepository.findOne({
      where: {
        userId,
        hash: BASELINE_HASH,
      },
    });
  }

  const baselineData: Partial<Baseline> = {
    userId,
    // `analysis.run` expects baselineVersion (baseline.version) to be a positive integer.
    version: 1,
    versionNumber: 1,
    originalFilename: 'local-score-seed-resume.pdf',
    mimeType: 'application/pdf',
    // Point to an actual local fixture so Studio can fetch a baseline source without error.
    storagePath: path.resolve(__dirname, '../../test/fixtures/baseline-sample.pdf'),
    hash: BASELINE_HASH,
    status: BaselineStatus.ACTIVE,
    isActive: true,
    preserveFromCleanup: true,
    syntheticScenarioKey: BASELINE_SCENARIO_KEY,
    firstAnalyzedAt: null,
    lastAnalyzedAt: null,
    originalBaselineScore: null,
    latestBaselineScore: null,
    latestAssessmentId: null,
  };

  if (!baseline) {
    baseline = baselineRepository.create(baselineData);
    console.log('Creating baseline for seeded scenario');
  } else {
    baseline = baselineRepository.merge(baseline, baselineData);
    console.log(`Reusing baseline ${baseline.id}`);
  }

  baseline = await baselineRepository.save(baseline);

  // Ensure a real `baseline_versions` row exists so Studio can hydrate a snapshot via `baselineVersionId`.
  const expectedVersionNumber = 1;
  let baselineVersion = await versionRepository.findOne({
    where: { baselineId: baseline.id, versionNumber: expectedVersionNumber },
  });
  const versionPayload: Partial<BaselineVersion> = {
    baselineId: baseline.id,
    versionNumber: expectedVersionNumber,
    fileHash: baseline.hash ?? null,
    storagePath: baseline.storagePath,
  };
  baselineVersion = baselineVersion
    ? versionRepository.merge(baselineVersion, versionPayload)
    : versionRepository.create(versionPayload);
  await versionRepository.save(baselineVersion);

  // Scoring prefers canonical baseline data from `baseline_parsed` when present.
  // For this seed we provide a deterministic canonical baseline payload aligned to the job,
  // rather than relying on PDF parsing or fallback heuristics.
  await parsedRepository.delete({ baselineId: baseline.id });

  await sectionRepository.delete({ baselineId: baseline.id });
  const totalChars = baselineSectionContents.reduce(
    (sum, section) => sum + section.content.length,
    0,
  );
  if (totalChars < 550) {
    throw new Error('Baseline sections do not meet the minimum content requirements.');
  }

  const sections = baselineSectionContents.map((content, index) =>
    sectionRepository.create({
      baselineId: baseline.id,
      sectionType: content.sectionType,
      title: content.title,
      content: content.content,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: index,
    }),
  );

  await sectionRepository.save(sections);

  const parsedJson = {
    schema_version: 'baseline_schema_v1',
    user_verified: true,
    baseline_id: baseline.id,
    source_file_id: randomUUID(),
    source_format: 'pdf',
    ingested_at: new Date().toISOString(),
    identity: {
      full_name: 'Local Validator',
      summary: baselineSectionContents[0]?.content ?? null,
      current_title: 'Senior Support Operations Manager',
      current_company: 'TargetThisRole Test',
      location: 'Remote',
    },
    experience: [
      {
        company: 'TargetThisRole Test',
        role: 'Senior Support Operations Manager',
        start_date: '2021-01',
        end_date: 'present',
        evidence: [],
        company_name: 'TargetThisRole Test',
        role_title: 'Senior Support Operations Manager',
        scope_summary:
          'Owned incident, problem, and change management with operational automation and stakeholder communications.',
        details_text: baselineSectionContents[1]?.content ?? '',
      },
    ],
    education: [],
    skills: [
      { name: 'Incident management', category: 'domain' },
      { name: 'Problem management', category: 'domain' },
      { name: 'Change management', category: 'domain' },
      { name: 'ITIL', category: 'domain' },
      { name: 'Runbooks', category: 'methodology' },
      { name: 'RCA facilitation', category: 'methodology' },
      { name: 'SLA reporting', category: 'methodology' },
      { name: 'Observability', category: 'domain' },
      { name: 'Ticketing tools', category: 'tooling' },
    ],
    people_leadership: {
      direct_reports: 2,
      managers_led: false,
      global_teams: true,
    },
    operational_ownership: {
      functions_owned: [
        'incident management',
        'problem management',
        'change management',
        'operational automation',
        'stakeholder communications',
      ],
      process_design: true,
      process_scaling: true,
    },
    tooling_and_platforms: {
      tools: ['Jira Service Management', 'ServiceNow', 'dashboards', 'alerting'],
      ownership_level: 'owned',
    },
    cross_functional_partnership: {
      product: true,
      engineering: false,
      sales_cs: true,
      executive: true,
    },
    customer_advocacy: {
      executive_escalations: true,
      voice_of_customer: true,
      post_incident_rca: null,
    },
    scale_and_scope: {
      customer_segment: 'mid_market',
      geo_scope: 'global',
      org_stage: 'growth',
    },
    metrics_and_outcomes: {
      metrics_present: true,
      metrics: ['MTTR', 'SLA compliance', 'ticket backlog', 'escalation trend'],
    },
    skills_and_tools: {
      tools: ['Jira Service Management', 'ServiceNow', 'dashboards', 'alerting'],
      methodologies: [
        'incident response',
        'RCA facilitation',
        'change advisory board',
        'runbook authoring',
      ],
      domains: ['B2B SaaS', 'support operations', 'reliability operations'],
    },
    system_generated_read_only: {
      missing_fields: [],
      ambiguity_flags: [],
      low_confidence_extractions: [],
    },
  };

  await parsedRepository.save(
    parsedRepository.create({
      baselineId: baseline.id,
      sourceFileId: (parsedJson as { source_file_id: string }).source_file_id,
      schemaVersion: 'baseline_schema_v1',
      sourceFormat: 'pdf',
      ingestedAt: new Date(),
      parsedJson,
      resumeV2Json: null,
      flagsJson: {},
    }),
  );
  return baseline;
}

async function ensureJob(userId: string): Promise<Job> {
  const repository = dataSource.getRepository(Job);
  const dedupeHash = createHash('sha256')
    .update(jobDescription.trim())
    .digest('hex');

  let job = await repository.findOne({
    where: {
      userId,
      sourceExternalId: JOB_EXTERNAL_ID,
    },
  });

  const jobPayload: Partial<Job> = {
    userId,
    title: JOB_TITLE,
    company: 'TargetThisRole Test',
    rawDescription: jobDescription.trim(),
    normalizedResponsibilities: jobResponsibilities,
    normalizedRequirements: jobRequirements,
    sourceExternalId: JOB_EXTERNAL_ID,
    dedupeHash,
    jdIngestionMethod: JobIngestionMethod.PASTE,
    jdParsedAt: new Date(),
  };

  if (job) {
    job = repository.merge(job, jobPayload);
    console.log(`Reusing job ${job.id}`);
  } else {
    job = repository.create(jobPayload);
    console.log('Creating job for seeded scenario');
  }

  return repository.save(job);
}

async function clearAssessments(userId: string, baselineId: string, jobId: string) {
  const repository = dataSource.getRepository(FitAssessment);
  await repository.delete({ userId, baselineId, jobId });
}

async function main() {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  try {
    const user = await ensureUser();
    const baseline = await ensureBaseline(user.id);
    const job = await ensureJob(user.id);
    await clearAssessments(user.id, baseline.id, job.id);

    console.log('Seed summary:');
    console.log(`  User email: ${user.email}`);
    console.log(`  Baseline ID: ${baseline.id}`);
    console.log(`  Job ID: ${job.id}`);
    console.log(`  Login password: ${SEED_USER_PASSWORD}`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error('Seeding failed', error);
  process.exit(1);
});
