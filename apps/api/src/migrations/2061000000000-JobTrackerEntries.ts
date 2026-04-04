import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobTrackerEntries2061000000000 implements MigrationInterface {
  name = 'JobTrackerEntries2061000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "job_tracker_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" character varying NOT NULL,
        "company" character varying(255) NOT NULL,
        "roleTitle" character varying(255) NOT NULL,
        "dateApplied" DATE,
        "cxFitScore" integer NOT NULL,
        "stage" character varying(255) NOT NULL,
        "notes" text,
        "sourceUrl" character varying(2048),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_tracker_entries_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_job_tracker_entries_userId" ON "job_tracker_entries" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_job_tracker_entries_createdAt" ON "job_tracker_entries" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_job_tracker_entries_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_job_tracker_entries_userId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "job_tracker_entries"`);
  }
}
