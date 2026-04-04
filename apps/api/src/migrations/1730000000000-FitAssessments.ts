import { MigrationInterface, QueryRunner } from 'typeorm';

export class FitAssessments1730000000000 implements MigrationInterface {
  name = 'FitAssessments1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'fit_assessments_verdict_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "fit_assessments_verdict_enum" AS ENUM('APPLY', 'CONSIDER', 'SKIP');
         END IF;
       EXCEPTION
         WHEN duplicate_object THEN
           NULL;
       END
       $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "fit_assessments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "baselineId" uuid NOT NULL,
        "baselineVersion" integer,
        "overallScore" integer NOT NULL,
        "verdict" "fit_assessments_verdict_enum" NOT NULL,
        "dimensionScores" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "strengths" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "gaps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "complianceFlags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "inputsHash" character varying(255),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fit_assessments_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fit_assessments_userId" ON "fit_assessments" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fit_assessments_jobId" ON "fit_assessments" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fit_assessments_baselineId" ON "fit_assessments" ("baselineId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_fit_assessments_createdAt" ON "fit_assessments" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_fit_assessments_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_fit_assessments_baselineId"`);
    await queryRunner.query(`DROP INDEX "IDX_fit_assessments_jobId"`);
    await queryRunner.query(`DROP INDEX "IDX_fit_assessments_userId"`);
    await queryRunner.query(`DROP TABLE "fit_assessments"`);
    await queryRunner.query(`DROP TYPE "fit_assessments_verdict_enum"`);
  }
}
