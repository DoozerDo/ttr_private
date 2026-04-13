import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationTrackerReadyStatus2440000000000 implements MigrationInterface {
  name = 'ApplicationTrackerReadyStatus2440000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'application_tracker_status_enum'
            AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "application_tracker_status_enum" AS ENUM('Prepared', 'Applied');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'application_tracker_status_enum'
            AND n.nspname = 'public'
            AND e.enumlabel = 'Not started'
        ) THEN
          ALTER TYPE "application_tracker_status_enum" ADD VALUE 'Not started';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'application_tracker_status_enum'
            AND n.nspname = 'public'
            AND e.enumlabel = 'Ready'
        ) THEN
          ALTER TYPE "application_tracker_status_enum" ADD VALUE 'Ready';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_user_baseline_job"
      ON "applications" ("userId", "baselineId", "jobId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_applications_user_baseline_job"`);
  }
}
