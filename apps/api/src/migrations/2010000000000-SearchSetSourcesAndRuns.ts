import { MigrationInterface, QueryRunner } from 'typeorm';

export class SearchSetSourcesAndRuns2010000000000 implements MigrationInterface {
  name = 'SearchSetSourcesAndRuns2010000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TYPE "search_sets_source_type_enum" AS ENUM('GREENHOUSE', 'LEVER', 'ASHBY')
    `);

    await queryRunner.query(`
      ALTER TABLE "search_sets"
      ADD COLUMN "sourceType" "search_sets_source_type_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "search_sets"
      ADD COLUMN "sourceOptions" jsonb
    `);

    await queryRunner.query(`
      ALTER TYPE "jobs_jdIngestionMethod_enum"
      ADD VALUE 'SOURCE_PROVIDER'
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN "sourceProviderId" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN "sourceExternalId" character varying(255)
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN "canonicalUrl" character varying(2048)
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN "dedupeHash" character varying(128)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_jobs_source_provider_external"
      ON "jobs" ("jdIngestionMethod", "sourceProviderId", "sourceExternalId")
      WHERE "sourceProviderId" IS NOT NULL AND "sourceExternalId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_jobs_canonical_url"
      ON "jobs" ("canonicalUrl")
      WHERE "canonicalUrl" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_jobs_dedupe_hash"
      ON "jobs" ("dedupeHash")
    `);

    await queryRunner.query(`
      CREATE TABLE "search_set_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "searchSetId" uuid NOT NULL,
        "baselineVersionId" uuid NOT NULL,
        "sourceSnapshot" jsonb,
        "runInputHash" character varying(128),
        "topResults" jsonb,
        "usedProviderDiscovery" boolean NOT NULL DEFAULT false,
        "executedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_search_set_runs_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_search_set_runs_searchSetId"
      ON "search_set_runs" ("searchSetId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_search_set_runs_baselineVersionId"
      ON "search_set_runs" ("baselineVersionId")
    `);

    await queryRunner.query(`
      ALTER TABLE "search_set_runs"
      ADD CONSTRAINT "FK_search_set_runs_search_sets"
      FOREIGN KEY ("searchSetId") REFERENCES "search_sets"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "search_set_runs"
      ADD CONSTRAINT "FK_search_set_runs_baseline_versions"
      FOREIGN KEY ("baselineVersionId") REFERENCES "baseline_versions"("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_set_runs" DROP CONSTRAINT "FK_search_set_runs_baseline_versions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_set_runs" DROP CONSTRAINT "FK_search_set_runs_search_sets"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_search_set_runs_baselineVersionId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_search_set_runs_searchSetId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "search_set_runs"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_dedupe_hash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_canonical_url"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_jobs_source_provider_external"`,
    );
    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "dedupeHash"
    `);
    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "canonicalUrl"
    `);
    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "sourceExternalId"
    `);
    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "sourceProviderId"
    `);
    await queryRunner.query(`
      ALTER TABLE "search_sets"
      DROP COLUMN IF EXISTS "sourceOptions"
    `);
    await queryRunner.query(`
      ALTER TABLE "search_sets"
      DROP COLUMN IF EXISTS "sourceType"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "search_sets_source_type_enum"`,
    );
  }
}
