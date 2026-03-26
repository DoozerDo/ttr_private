import { MigrationInterface, QueryRunner } from 'typeorm';

export class Applications1760000000000 implements MigrationInterface {
  name = 'Applications1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'applications_stage_enum'
            AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "applications_stage_enum" AS ENUM('SAVED', 'APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN');
        END IF;
      END $$;
    `);

    const tableExists = await queryRunner.hasTable('applications');
    if (!tableExists) {
      await queryRunner.query(`
        CREATE TABLE "applications" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "userId" uuid NOT NULL,
          "jobId" uuid,
          "company" character varying(255) NOT NULL,
          "title" character varying(255) NOT NULL,
          "appliedDate" TIMESTAMP WITH TIME ZONE,
          "fitScore" integer,
          "stage" "applications_stage_enum" NOT NULL DEFAULT 'SAVED',
          "notes" text,
          "sourceUrl" character varying(2048),
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_applications_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_applications_job" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL
        )
      `);
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_applications_userId" ON "applications" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_applications_stage" ON "applications" ("stage")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_applications_stage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_applications_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "applications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "applications_stage_enum"`);
  }
}
