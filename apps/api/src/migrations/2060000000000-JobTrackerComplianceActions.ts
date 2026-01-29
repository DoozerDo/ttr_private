import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobTrackerComplianceActions2060000000000 implements MigrationInterface {
  name = 'JobTrackerComplianceActions2060000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "compliance_audits_action_enum" ADD VALUE IF NOT EXISTS 'job_tracker_create'`,
    );
    await queryRunner.query(
      `ALTER TYPE "compliance_audits_action_enum" ADD VALUE IF NOT EXISTS 'job_tracker_update'`,
    );
    await queryRunner.query(
      `ALTER TYPE "compliance_audits_action_enum" ADD VALUE IF NOT EXISTS 'job_tracker_delete'`,
    );
    await queryRunner.query(
      `ALTER TYPE "compliance_audits_action_enum" ADD VALUE IF NOT EXISTS 'job_tracker_export'`,
    );
  }

  public down(_queryRunner: QueryRunner): Promise<void> {
    void _queryRunner;
    return Promise.resolve();
  }
}
