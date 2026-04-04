import { MigrationInterface, QueryRunner } from 'typeorm';

export class SyntheticRunStepResults2200000000000 implements MigrationInterface {
  name = 'SyntheticRunStepResults2200000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "synthetic_cleanup_runs"
      ADD COLUMN IF NOT EXISTS "stepResultsJson" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE IF EXISTS "synthetic_cleanup_runs"
      DROP COLUMN IF EXISTS "stepResultsJson";
    `);
  }
}
