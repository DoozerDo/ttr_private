import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationBaselineLink2400000000000 implements MigrationInterface {
  name = 'ApplicationBaselineLink2400000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "baselineId" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_applications_baselineId" ON "applications" ("baselineId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_applications_baselineId"
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "baselineId"
    `);
  }
}
