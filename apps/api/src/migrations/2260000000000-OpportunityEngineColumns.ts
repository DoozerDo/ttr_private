import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpportunityEngineColumns2260000000000 implements MigrationInterface {
  name = 'OpportunityEngineColumns2260000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "job_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "analysis_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "baseline_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "notes" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "baseline_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "analysis_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "job_id"`,
    );
  }
}

