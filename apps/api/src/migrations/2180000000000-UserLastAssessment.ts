import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLastAssessment2180000000000 implements MigrationInterface {
  name = 'UserLastAssessment2180000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "lastAssessmentId" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "lastAssessmentId"
    `);
  }
}
