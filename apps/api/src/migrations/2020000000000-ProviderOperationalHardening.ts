import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderOperationalHardening2020000000000 implements MigrationInterface {
  name = 'ProviderOperationalHardening2020000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_jobs_source_provider_external"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_canonical_url"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_dedupe_hash"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_jobs_user_provider_external"
      ON "jobs" ("userId", "jdIngestionMethod", "sourceProviderId", "sourceExternalId")
      WHERE "sourceProviderId" IS NOT NULL AND "sourceExternalId" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_jobs_user_canonical_url"
      ON "jobs" ("userId", "canonicalUrl")
      WHERE "canonicalUrl" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_jobs_user_dedupe_hash"
      ON "jobs" ("userId", "dedupeHash")
      WHERE "dedupeHash" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "search_set_runs"
      ADD COLUMN "failureCount" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "search_set_runs"
      DROP COLUMN IF EXISTS "failureCount"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_user_dedupe_hash"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_jobs_user_canonical_url"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_jobs_user_provider_external"`,
    );

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
  }
}
