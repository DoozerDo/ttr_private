import 'reflect-metadata';
import path from 'path';
import { createHash } from 'crypto';
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
import { Job, JobIngestionMethod } from '../jobs/job.entity';

dotenv.config({
  path: path.resolve(__dirname, '../../.env.development.local'),
});

const SEED_USER_EMAIL = 'local-score-seed@targetthisrole.test';
const SEED_USER_PASSWORD = 'LocalScore123!';
const BASELINE_SCENARIO_KEY = 'local-score-seed-baseline';
const BASELINE_HASH = 'local-score-baseline-v1';
const JOB_EXTERNAL_ID = 'local-score-seed-job';
const JOB_TITLE = 'Local scoring validation role';

const baselineSectionContents = [
  {
    sectionType: BaselineSectionType.SUMMARY,
    title: 'Professional summary',
    content:
      'Product marketing leader who designs repeatable go-to-market programs with precise positioning, research-backed narratives, and measurable KPIs. I translate complex product stories into clear customer outcomes by meeting regularly with product, GTM, and analytics partners, documenting product-market fit signals, and building the stories that earn executive trust before launch. This work includes capturing qualitative takeaways, creating executive-ready briefings, and mentoring PMs and writers on conversion-led storytelling.',
  },
  {
    sectionType: BaselineSectionType.EXPERIENCE,
    title: 'Recent experience highlights',
    content:
      'Led a distributed, cross-functional program that synchronized research, analytics, content, and enablement teams across three launches. Defined success metrics, oversaw experiment tracking, drafted playbooks for sales readiness, and coordinated post-launch reviews with customer success and insights. Mentored fellows on research interviews, deeper segmentation, and building dashboards that highlight both adoption and sentiment metrics for the newly positioned platform.',
  },
];

const jobDescription = `
We are hiring a product marketing practitioner who can own the strategy behind go-to-market programs, product positioning, and enablement for a critical platform. You will work closely with product, analytics, research, and sales leadership to document market signals, clarify customer stories, and drive measurable launch outcomes. The ideal candidate has experience crafting launch narratives, translating product research into positioning that resonates with leadership, and leading cross-functional tactics from research synthesis to enablement.

Responsibilities include documenting positioning for executive reviews, designing validation plans, aligning Enablement on value props, and creating scoring frameworks with research and analytics partners. You will orchestrate release readiness checkpoints, build measurement plans, and make sure metrics are baked into each campaign so the broader team can iterate on adoption signals. A strong candidate keeps digestion of analytics and qualitative insights tight to product development, mentors more junior go-to-market teammates, and keeps every experiment tied back to clear focus areas like adoption, expansion, and retention.

The candidate will also coach other marketers on how to translate research into launch materials, lead narrative sessions, and deliver concise training that enables sales, success, and customer advocacy teams. You will preserve a culture of storytelling grounded in research and metrics, and be the guardian of clarity whenever new product capabilities are shared with the broader team.
`;

const jobResponsibilities = [
  'Own go-to-market strategy, validation plans, and launch readiness for the platform portfolio.',
  'Translate product research, analytics, and customer interviews into compelling positioning and enablement narratives.',
  'Partner with sales, enablement, and research to build measurable experiments that connect adoption signals back to the narrative.',
];

const jobRequirements = [
  '7+ years in product marketing with a strong bias for research-informed storytelling in B2B SaaS.',
  'Demonstrated experience guiding cross-functional teams through launch playbooks, enablement, and executive storytelling.',
  'Comfortable balancing qualitative insights with analytics, and mentoring more junior marketing teammates.',
];

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
  entities: [path.resolve(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [path.resolve(__dirname, '../migrations/*.{ts,js}')],
  synchronize: false,
});

async function ensureUser(): Promise<User> {
  const repository = dataSource.getRepository(User);
  let user = await repository.findOne({ where: { email: SEED_USER_EMAIL } });
  if (user) {
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
    role: 'user',
    subscriptionTier: SubscriptionTier.FREE,
    accountType: AccountType.FREE,
  });

  user = await repository.save(user);
  console.log(`Created user ${user.email} id=${user.id}`);
  return user;
}

async function ensureBaseline(userId: string): Promise<Baseline> {
  const baselineRepository = dataSource.getRepository(Baseline);
  const sectionRepository = dataSource.getRepository(BaselineSection);

  let baseline = await baselineRepository.findOne({
    where: {
      userId,
      syntheticScenarioKey: BASELINE_SCENARIO_KEY,
    },
  });

  const baselineData: Partial<Baseline> = {
    userId,
    version: 0,
    versionNumber: 1,
    originalFilename: 'local-score-seed-resume.pdf',
    mimeType: 'application/pdf',
    storagePath: 'local-seed/local-score-seed-resume.pdf',
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

async function main() {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  try {
    const user = await ensureUser();
    const baseline = await ensureBaseline(user.id);
    const job = await ensureJob(user.id);

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
