import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpportunityPairUniqueIndex2430000000000 implements MigrationInterface {
  name = 'OpportunityPairUniqueIndex2430000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_opportunities_user_pair"
      ON "opportunities" ("user_id", "baseline_id", "job_id")
      WHERE "baseline_id" IS NOT NULL AND "job_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_opportunities_user_pair"
    `);
  }
}
