import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationAnalysisLink2410000000000
  implements MigrationInterface
{
  name = 'ApplicationAnalysisLink2410000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "analysisId" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_analysisId" ON "applications" ("analysisId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_applications_analysisId"
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "analysisId"
    `);
  }
}
