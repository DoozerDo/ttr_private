import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineLatestAssessmentId2390000000000
  implements MigrationInterface
{
  name = 'BaselineLatestAssessmentId2390000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN IF NOT EXISTS "latestAssessmentId" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "latestAssessmentId"
    `);
  }
}
