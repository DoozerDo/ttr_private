import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselinePromotionComplianceAction1910000000000 implements MigrationInterface {
  name = 'BaselinePromotionComplianceAction1910000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "compliance_audits_action_enum" ADD VALUE IF NOT EXISTS 'baseline_promotion'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres enums do not allow removing values easily, so we leave the value in place.
  }
}
