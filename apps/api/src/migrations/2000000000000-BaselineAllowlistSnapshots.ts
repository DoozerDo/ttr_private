import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineAllowlistSnapshots2000000000000 implements MigrationInterface {
  name = 'BaselineAllowlistSnapshots2000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baseline_versions"
      ADD COLUMN "allowedCompanies" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN "allowedRoles" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN "allowedTechnologies" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN "allowedMetricTokens" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baseline_versions"
      DROP COLUMN "allowedMetricTokens",
      DROP COLUMN "allowedTechnologies",
      DROP COLUMN "allowedRoles",
      DROP COLUMN "allowedCompanies";
    `);
  }
}
