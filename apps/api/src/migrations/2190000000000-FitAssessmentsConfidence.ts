import { MigrationInterface, QueryRunner } from 'typeorm';

export class FitAssessmentsConfidence2190000000000 implements MigrationInterface {
  name = 'FitAssessmentsConfidence2190000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fit_assessments"
      ADD COLUMN "confidenceScore" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "fit_assessments"
      ADD COLUMN "confidenceReasons" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fit_assessments"
      DROP COLUMN IF EXISTS "confidenceReasons"
    `);
    await queryRunner.query(`
      ALTER TABLE "fit_assessments"
      DROP COLUMN IF EXISTS "confidenceScore"
    `);
  }
}
