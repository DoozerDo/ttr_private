import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineSyntheticColumns2300000000000 implements MigrationInterface {
  name = 'BaselineSyntheticColumns2300000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN IF NOT EXISTS "isSynthetic" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN IF NOT EXISTS "syntheticScenarioKey" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN IF NOT EXISTS "syntheticRunId" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN IF NOT EXISTS "syntheticCreatedAt" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN IF NOT EXISTS "preserveFromCleanup" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "preserveFromCleanup"
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "syntheticCreatedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "syntheticRunId"
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "syntheticScenarioKey"
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "isSynthetic"
    `);
  }
}
