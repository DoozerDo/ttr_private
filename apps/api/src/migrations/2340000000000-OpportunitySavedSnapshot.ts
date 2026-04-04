import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpportunitySavedSnapshot2340000000000 implements MigrationInterface {
  name = 'OpportunitySavedSnapshot2340000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "saved_fit_score" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "saved_job_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "saved_baseline_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "saved_generation_completed" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "saved_evidence_summary" text[]`,
    );
    await queryRunner.query(
      `UPDATE "opportunities" SET "saved_fit_score" = "initial_score" WHERE "saved_fit_score" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "opportunities" SET "saved_job_id" = "job_id" WHERE "saved_job_id" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "opportunities" SET "saved_baseline_id" = "baseline_id" WHERE "saved_baseline_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "saved_evidence_summary"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "saved_generation_completed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "saved_baseline_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "saved_job_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "saved_fit_score"`,
    );
  }
}
