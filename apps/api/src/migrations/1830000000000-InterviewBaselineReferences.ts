import { MigrationInterface, QueryRunner } from 'typeorm';

export class InterviewBaselineReferences1830000000000 implements MigrationInterface {
  name = 'InterviewBaselineReferences1830000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "baselineId" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "baselineVersionId" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "interviews" DROP COLUMN IF EXISTS "baselineVersionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "interviews" DROP COLUMN IF EXISTS "baselineId"`,
    );
  }
}
