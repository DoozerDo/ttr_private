import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpportunityPairUniqueIndex2430000000000 implements MigrationInterface {
  name = 'OpportunityPairUniqueIndex2430000000000';
  public transaction = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH duplicates AS (
        SELECT "id"
        FROM (
          SELECT
            "id",
            ROW_NUMBER() OVER (
              PARTITION BY "user_id", "baseline_id", "job_id"
              ORDER BY "updated_at" DESC NULLS LAST, "created_at" DESC NULLS LAST, "id" DESC
            ) AS "row_number"
          FROM "opportunities"
          WHERE "baseline_id" IS NOT NULL AND "job_id" IS NOT NULL
        ) ranked
        WHERE ranked."row_number" > 1
      )
      DELETE FROM "opportunities"
      WHERE "id" IN (SELECT "id" FROM duplicates)
    `);

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
