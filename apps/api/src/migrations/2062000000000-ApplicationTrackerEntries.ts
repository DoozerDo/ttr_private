import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationTrackerEntries2062000000000
  implements MigrationInterface
{
  name = 'ApplicationTrackerEntries2062000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "application_tracker_status_enum" AS ENUM('Prepared', 'Applied')
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD "jobUrl" character varying(2048),
      ADD "fingerprint" character varying(255) NOT NULL DEFAULT gen_random_uuid(),
      ADD "status" "application_tracker_status_enum" NOT NULL DEFAULT 'Prepared',
      ADD "preparedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      ADD "appliedAt" TIMESTAMP WITH TIME ZONE,
      ADD "lastTouchedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      ADD "baselineVersionId" uuid,
      ADD "cxFitScoreSnapshot" jsonb NOT NULL DEFAULT '{}',
      ADD "resumeArtifacts" jsonb NOT NULL DEFAULT '[]'
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_applications_jobId" ON "applications" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_applications_status" ON "applications" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_applications_lastTouchedAt" ON "applications" ("lastTouchedAt")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_applications_user_fingerprint" ON "applications" ("userId", "fingerprint")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_applications_user_fingerprint"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_applications_lastTouchedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_applications_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_applications_jobId"`,
    );
    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "resumeArtifacts",
      DROP COLUMN IF EXISTS "cxFitScoreSnapshot",
      DROP COLUMN IF EXISTS "baselineVersionId",
      DROP COLUMN IF EXISTS "lastTouchedAt",
      DROP COLUMN IF EXISTS "appliedAt",
      DROP COLUMN IF EXISTS "preparedAt",
      DROP COLUMN IF EXISTS "status",
      DROP COLUMN IF EXISTS "fingerprint",
      DROP COLUMN IF EXISTS "jobUrl"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "application_tracker_status_enum"`,
    );
  }
}
