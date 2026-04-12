import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkflowIdempotencyHardening2340000000000
  implements MigrationInterface
{
  name = 'WorkflowIdempotencyHardening2340000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_operation_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "operationName" character varying(64) NOT NULL,
        "dedupeKey" character varying(255) NOT NULL,
        "runId" character varying(128) NOT NULL,
        "status" character varying(32) NOT NULL,
        "responseBody" jsonb,
        "errorCode" character varying(255),
        "errorMessage" text,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_operation_runs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_workflow_operation_runs_scope"
      ON "workflow_operation_runs" ("userId", "operationName", "dedupeKey")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workflow_operation_runs_status"
      ON "workflow_operation_runs" ("status")
    `);
    const hasUpdatedAtColumnResult =
      (await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'fit_assessments'
            AND column_name = 'updatedAt'
        ) AS "exists"
      `)) as Array<{ exists: boolean }>;
    const freshnessColumn = hasUpdatedAtColumnResult?.[0]?.exists
      ? '"updatedAt"'
      : '"createdAt"';
    await queryRunner.query(`
      WITH duplicates AS (
        SELECT "id"
        FROM (
          SELECT
            "id",
            ROW_NUMBER() OVER (
              PARTITION BY "userId", "jobId", "baselineId", "inputsHash"
              ORDER BY ${freshnessColumn} DESC, "createdAt" DESC, "id" DESC
            ) AS "row_number"
          FROM "fit_assessments"
          WHERE "inputsHash" IS NOT NULL
        ) ranked
        WHERE ranked."row_number" > 1
      )
      DELETE FROM "fit_assessments"
      WHERE "id" IN (SELECT "id" FROM duplicates)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_fit_assessments_user_job_baseline_inputs_hash"
      ON "fit_assessments" ("userId", "jobId", "baselineId", "inputsHash")
      WHERE "inputsHash" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "expanded_fit_assessments"
      ADD COLUMN IF NOT EXISTS "requestHash" character varying(255)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_expanded_fit_assessments_scope"
      ON "expanded_fit_assessments" ("userId", "interviewId", "requestHash")
      WHERE "requestHash" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cover_letters_generation_inputs_hash"
      ON "cover_letters" ("userId", "baselineId", "jobId", "generationInputsHash")
      WHERE "generationInputsHash" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cover_letters_generation_inputs_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_expanded_fit_assessments_scope"`);
    await queryRunner.query(`ALTER TABLE "expanded_fit_assessments" DROP COLUMN IF EXISTS "requestHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_fit_assessments_user_job_baseline_inputs_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_operation_runs_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_workflow_operation_runs_scope"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_operation_runs"`);
  }
}
