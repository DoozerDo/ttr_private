import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobDescriptionNormalization1722000000000 implements MigrationInterface {
  name = 'JobDescriptionNormalization1722000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           INNER JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'jobs_jdIngestionMethod_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "jobs_jdIngestionMethod_enum" AS ENUM('PASTE', 'URL');
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "jobs" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "userId" uuid,
         "title" character varying(512),
         "company" character varying(512),
         "description" text,
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_jobs_id" PRIMARY KEY ("id")
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "userId" uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "sourceUrl" character varying(2048)`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "normalizedResponsibilities" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "normalizedRequirements" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "jdIngestionMethod" "jobs_jdIngestionMethod_enum" NOT NULL DEFAULT 'PASTE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "jdParsedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.jobs') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "jobs" DROP COLUMN IF EXISTS "jdParsedAt"';
           EXECUTE 'ALTER TABLE "jobs" DROP COLUMN IF EXISTS "jdIngestionMethod"';
           EXECUTE 'ALTER TABLE "jobs" DROP COLUMN IF EXISTS "normalizedRequirements"';
           EXECUTE 'ALTER TABLE "jobs" DROP COLUMN IF EXISTS "normalizedResponsibilities"';
           EXECUTE 'ALTER TABLE "jobs" DROP COLUMN IF EXISTS "sourceUrl"';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       DECLARE
         enum_in_use boolean;
       BEGIN
         SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.udt_schema = 'public'
             AND c.udt_name = 'jobs_jdIngestionMethod_enum'
         )
         INTO enum_in_use;

         IF NOT enum_in_use THEN
           EXECUTE 'DROP TYPE IF EXISTS "jobs_jdIngestionMethod_enum"';
         END IF;
       END
       $$;`,
    );
  }
}
