import { MigrationInterface, QueryRunner } from 'typeorm';

export class FitAssessmentsConfidence2190000000000 implements MigrationInterface {
  name = 'FitAssessmentsConfidence2190000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.fit_assessments') IS NOT NULL THEN
          ALTER TABLE "fit_assessments"
          ADD COLUMN IF NOT EXISTS "confidenceScore" integer;
          ALTER TABLE "fit_assessments"
          ADD COLUMN IF NOT EXISTS "confidenceReasons" jsonb;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.fit_assessments') IS NOT NULL THEN
          ALTER TABLE "fit_assessments"
          DROP COLUMN IF EXISTS "confidenceReasons";
          ALTER TABLE "fit_assessments"
          DROP COLUMN IF EXISTS "confidenceScore";
        END IF;
      END
      $$;
    `);
  }
}
