import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyntheticMetadataColumnsBackfill2320000000000 implements MigrationInterface {
  name = 'SyntheticMetadataColumnsBackfill2320000000000';

  private readonly tables = [
    'users',
    'baselines',
    'fit_assessments',
    'analytics_events',
    'applications',
    'beta_feedback',
    'cover_letters',
    'interviews',
    'job_tracker_entries',
    'opportunities',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        ADD COLUMN IF NOT EXISTS "isSynthetic" boolean NOT NULL DEFAULT false
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        ADD COLUMN IF NOT EXISTS "syntheticScenarioKey" character varying(128)
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        ADD COLUMN IF NOT EXISTS "syntheticRunId" character varying(128)
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        ADD COLUMN IF NOT EXISTS "syntheticCreatedAt" TIMESTAMPTZ
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        ADD COLUMN IF NOT EXISTS "preserveFromCleanup" boolean NOT NULL DEFAULT false
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        DROP COLUMN IF EXISTS "preserveFromCleanup"
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        DROP COLUMN IF EXISTS "syntheticCreatedAt"
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        DROP COLUMN IF EXISTS "syntheticRunId"
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        DROP COLUMN IF EXISTS "syntheticScenarioKey"
      `);
      await queryRunner.query(`
        ALTER TABLE IF EXISTS "${table}"
        DROP COLUMN IF EXISTS "isSynthetic"
      `);
    }
  }
}
