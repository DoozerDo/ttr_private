import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineVersionAdditions1850000000000 implements MigrationInterface {
  name = 'BaselineVersionAdditions1850000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baseline_versions" ADD COLUMN IF NOT EXISTS "verifiedAdditions" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "baseline_versions" ADD COLUMN IF NOT EXISTS "additionDiff" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "baseline_versions" ADD COLUMN IF NOT EXISTS "promotedFromInterviewId" character varying(255)`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "expanded_fit_assessments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "baselineId" uuid NOT NULL,
        "baselineVersion" integer,
        "fitAssessmentId" uuid,
        "interviewId" uuid,
        "originalScore" integer NOT NULL,
        "expandedScore" integer NOT NULL,
        "delta" integer NOT NULL,
        "additions" jsonb NOT NULL DEFAULT '[]',
        "expandedDimensionScores" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expanded_fit_assessments_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expanded_fit_assessment_fit" ON "expanded_fit_assessments" ("fitAssessmentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expanded_fit_assessment_interview" ON "expanded_fit_assessments" ("interviewId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expanded_fit_assessment_interview"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_expanded_fit_assessment_fit"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expanded_fit_assessments"`);
    await queryRunner.query(
      `ALTER TABLE "baseline_versions" DROP COLUMN IF EXISTS "promotedFromInterviewId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "baseline_versions" DROP COLUMN IF EXISTS "additionDiff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "baseline_versions" DROP COLUMN IF EXISTS "verifiedAdditions"`,
    );
  }
}
