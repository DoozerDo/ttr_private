import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineVersions1740000000000 implements MigrationInterface {
  name = 'BaselineVersions1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           INNER JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'baselines_status_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "baselines_status_enum" AS ENUM('ACTIVE', 'ARCHIVED');
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "baselines" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 0,
        "originalFilename" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "storagePath" character varying NOT NULL,
        "hash" character varying(255),
        "status" "baselines_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "archivedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_baselines_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "baseline_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "baselineId" uuid NOT NULL,
        "versionNumber" integer NOT NULL,
        "fileHash" character varying(255),
        "storagePath" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_baseline_versions_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF EXISTS (
           SELECT 1
           FROM pg_class c
           INNER JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relname = 'baseline_versions'
             AND c.relkind = 'r'
             AND n.nspname = 'public'
         ) AND NOT EXISTS (
           SELECT 1
           FROM pg_constraint con
           WHERE con.conname = 'FK_baseline_versions_baselineId'
         ) THEN
           ALTER TABLE "baseline_versions"
           ADD CONSTRAINT "FK_baseline_versions_baselineId"
           FOREIGN KEY ("baselineId") REFERENCES "baselines"("id") ON DELETE CASCADE;
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_baseline_versions_baselineId_versionNumber" ON "baseline_versions" ("baselineId", "versionNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_versions_baselineId" ON "baseline_versions" ("baselineId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_versions_baselineId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_versions_baselineId_versionNumber"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "baseline_versions"`);
  }
}
