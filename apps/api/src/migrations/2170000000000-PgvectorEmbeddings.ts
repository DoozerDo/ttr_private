import { MigrationInterface, QueryRunner } from 'typeorm';

export class PgvectorEmbeddings2170000000000 implements MigrationInterface {
  name = 'PgvectorEmbeddings2170000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS vector
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN "embedding" vector(1536)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_jobs_embedding_ivfflat" ON "jobs"
      USING ivfflat ("embedding" vector_cosine_ops)
    `);

    await queryRunner.query(`
      ALTER TABLE "baseline_sections"
      ADD COLUMN "embedding" vector(1536)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_baseline_sections_embedding_ivfflat" ON "baseline_sections"
      USING ivfflat ("embedding" vector_cosine_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_baseline_sections_embedding_ivfflat"
    `);

    await queryRunner.query(`
      ALTER TABLE "baseline_sections"
      DROP COLUMN IF EXISTS "embedding"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_jobs_embedding_ivfflat"
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "embedding"
    `);

    await queryRunner.query(`
      DROP EXTENSION IF EXISTS vector
    `);
  }
}
