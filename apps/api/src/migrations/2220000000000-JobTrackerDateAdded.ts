import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobTrackerDateAdded2220000000000 implements MigrationInterface {
  name = 'JobTrackerDateAdded2220000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_tracker_entries"
      ADD COLUMN "dateAdded" DATE
    `);

    await queryRunner.query(`
      UPDATE "job_tracker_entries"
      SET "dateAdded" = COALESCE("dateApplied", ("createdAt" AT TIME ZONE 'UTC')::date)
      WHERE "dateAdded" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "job_tracker_entries"
      ALTER COLUMN "dateAdded" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "job_tracker_entries"
      ALTER COLUMN "dateAdded" SET DEFAULT CURRENT_DATE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_tracker_entries"
      DROP COLUMN IF EXISTS "dateAdded"
    `);
  }
}
