import { MigrationInterface, QueryRunner } from 'typeorm';

export class PgvectorEmbeddings2170000000000 implements MigrationInterface {
  name = 'PgvectorEmbeddings2170000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE EXTENSION IF NOT EXISTS "vector";
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pgvector extension not available, skipping vector schema';
      END
      $$;
    `);

    const rows = await queryRunner.query(`
      SELECT 1 FROM pg_type WHERE typname = 'vector' LIMIT 1
    `);
    const hasVector = Array.isArray(rows) && rows.length > 0;

    if (!hasVector) {
      console.warn(
        '[migration:PgvectorEmbeddings2170000000000] pgvector not available; skipping vector columns/indexes',
      );
      return;
    }

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
    const rows = await queryRunner.query(`
      SELECT 1 FROM pg_type WHERE typname = 'vector' LIMIT 1
    `);
    const hasVector = Array.isArray(rows) && rows.length > 0;

    if (!hasVector) {
      return;
    }

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
  }
}
