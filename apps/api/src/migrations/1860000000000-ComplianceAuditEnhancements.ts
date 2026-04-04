import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComplianceAuditEnhancements1860000000000 implements MigrationInterface {
  name = 'ComplianceAuditEnhancements1860000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "compliance_audits_action_enum" ADD VALUE IF NOT EXISTS 'follow_up_gen'`,
    );

    await queryRunner.query(
      `ALTER TABLE "compliance_audits" ADD COLUMN IF NOT EXISTS "baselineVersionId" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_audits" ADD COLUMN IF NOT EXISTS "jobId" uuid NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "compliance_audits" DROP COLUMN IF EXISTS "jobId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_audits" DROP COLUMN IF EXISTS "baselineVersionId"`,
    );
    // Note: postgres enum values cannot be easily removed; retaining added value on down migration.
  }
}
