import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyntheticReliabilityFoundation2190000000000 implements MigrationInterface {
  name = 'SyntheticReliabilityFoundation2190000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tablesWithCamelColumns = [
      'users',
      'baselines',
      'fit_assessments',
      'expanded_fit_assessments',
      'interviews',
      'applications',
      'cover_letters',
      'job_tracker_entries',
      'opportunities',
      'beta_feedback',
      'analytics_events',
    ];

    for (const table of tablesWithCamelColumns) {
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        ADD COLUMN IF NOT EXISTS "isSynthetic" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "syntheticScenarioKey" character varying(128),
        ADD COLUMN IF NOT EXISTS "syntheticRunId" character varying(128),
        ADD COLUMN IF NOT EXISTS "syntheticCreatedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "preserveFromCleanup" boolean NOT NULL DEFAULT false;
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "synthetic_cleanup_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "runType" character varying(64) NOT NULL,
        "scenarioKey" character varying(128),
        "syntheticRunId" character varying(128),
        "status" character varying(32) NOT NULL,
        "triggerSource" character varying(32) NOT NULL,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "finishedAt" TIMESTAMP WITH TIME ZONE,
        "durationMs" integer,
        "summaryJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "errorMessage" text,
        CONSTRAINT "PK_synthetic_cleanup_runs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_synthetic_cleanup_runs_started_at"
      ON "synthetic_cleanup_runs" ("startedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_synthetic_cleanup_runs_started_at"');
    await queryRunner.query('DROP TABLE IF EXISTS "synthetic_cleanup_runs"');

    const tablesWithCamelColumns = [
      'users',
      'baselines',
      'fit_assessments',
      'expanded_fit_assessments',
      'interviews',
      'applications',
      'cover_letters',
      'job_tracker_entries',
      'opportunities',
      'beta_feedback',
      'analytics_events',
    ];

    for (const table of tablesWithCamelColumns) {
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        DROP COLUMN IF EXISTS "preserveFromCleanup",
        DROP COLUMN IF EXISTS "syntheticCreatedAt",
        DROP COLUMN IF EXISTS "syntheticRunId",
        DROP COLUMN IF EXISTS "syntheticScenarioKey",
        DROP COLUMN IF EXISTS "isSynthetic";
      `);
    }
  }
}
