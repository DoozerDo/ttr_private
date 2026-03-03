import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairMissingEmbeddingsColumns2170000000001
  implements MigrationInterface
{
  name = 'RepairMissingEmbeddingsColumns2170000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN IF NOT EXISTS "embedding" vector
    `);

    await queryRunner.query(`
      ALTER TABLE "baseline_sections"
      ADD COLUMN IF NOT EXISTS "embedding" vector
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baseline_sections"
      DROP COLUMN IF EXISTS "embedding"
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "embedding"
    `);
  }
}
