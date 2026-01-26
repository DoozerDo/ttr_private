import { MigrationInterface, QueryRunner } from 'typeorm';

export class InterviewAcceptedAdditions1870000000000 implements MigrationInterface {
  name = 'InterviewAcceptedAdditions1870000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "acceptedAdditionIds" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "promotedBaselineVersionId" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "expandedFitAssessment" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "interviews" DROP COLUMN IF EXISTS "expandedFitAssessment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interviews" DROP COLUMN IF EXISTS "promotedBaselineVersionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interviews" DROP COLUMN IF EXISTS "acceptedAdditionIds"`,
    );
  }
}
