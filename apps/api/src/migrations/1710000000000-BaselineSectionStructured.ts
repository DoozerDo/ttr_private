import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineSectionStructured1710000000000 implements MigrationInterface {
  name = 'BaselineSectionStructured1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           INNER JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'baseline_sections_type_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "baseline_sections_type_enum" AS ENUM(
             'RAW',
             'SUMMARY',
             'EXPERIENCE',
             'PROJECT',
             'SKILLS',
             'EDUCATION',
             'OTHER'
           );
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "baseline_sections" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "baselineId" uuid NOT NULL,
         "type" "baseline_sections_type_enum" NOT NULL DEFAULT 'OTHER',
         "title" character varying(255),
         "content" text NOT NULL,
         "includePolicy" character varying(50) NOT NULL DEFAULT 'never',
         "orderIndex" integer NOT NULL DEFAULT 0,
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_baseline_sections_id" PRIMARY KEY ("id")
       )`,
    );

    await queryRunner.query(
      `DO $$
       DECLARE
         current_udt_name text;
       BEGIN
         SELECT c.udt_name
         INTO current_udt_name
         FROM information_schema.columns c
         WHERE c.table_schema = 'public'
           AND c.table_name = 'baseline_sections'
           AND c.column_name = 'type';

         IF current_udt_name IS NOT NULL
            AND current_udt_name <> 'baseline_sections_type_enum' THEN
           EXECUTE 'ALTER TABLE "baseline_sections" ALTER COLUMN "type" DROP DEFAULT';
           EXECUTE 'ALTER TABLE "baseline_sections"
                    ALTER COLUMN "type" TYPE "baseline_sections_type_enum"
                    USING (
                      CASE
                        WHEN upper(COALESCE("type", ''OTHER'')) IN (''RAW'', ''SUMMARY'', ''EXPERIENCE'', ''PROJECT'', ''SKILLS'', ''EDUCATION'', ''OTHER'')
                          THEN upper(COALESCE("type", ''OTHER''))
                        ELSE ''OTHER''
                      END
                    )::"baseline_sections_type_enum"';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF EXISTS (
           SELECT 1
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'baseline_sections'
             AND c.column_name = 'type'
         ) THEN
           EXECUTE 'ALTER TABLE "baseline_sections"
                    ALTER COLUMN "type" SET DEFAULT ''OTHER''::"baseline_sections_type_enum"';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `ALTER TABLE "baseline_sections" ADD COLUMN IF NOT EXISTS "title" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "baseline_sections" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_sections_baselineId" ON "baseline_sections" ("baselineId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_sections_orderIndex" ON "baseline_sections" ("orderIndex")`,
    );

    await queryRunner.query(
      `INSERT INTO "baseline_sections" ("id", "baselineId", "type", "title", "content", "includePolicy", "orderIndex", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), s."baselineId", 'RAW', 'Raw', s."content", 'never', 0, NOW(), NOW()
       FROM (
         SELECT DISTINCT ON ("baselineId") "baselineId", "content"
         FROM "baseline_sections"
         WHERE "type" <> 'RAW'
         ORDER BY "baselineId", "orderIndex" ASC
       ) s
       WHERE NOT EXISTS (
         SELECT 1 FROM "baseline_sections" existing
         WHERE existing."baselineId" = s."baselineId" AND existing."type" = 'RAW'
       )`,
    );

    await queryRunner.query(
      `UPDATE "baseline_sections" SET "orderIndex" = "orderIndex" + 1 WHERE "type" <> 'RAW'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.baseline_sections') IS NOT NULL THEN
           EXECUTE 'UPDATE "baseline_sections"
                    SET "orderIndex" = CASE WHEN "orderIndex" > 0 THEN "orderIndex" - 1 ELSE 0 END
                    WHERE "type" <> ''RAW''';
           EXECUTE 'DELETE FROM "baseline_sections" WHERE "type" = ''RAW''';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_sections_orderIndex"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_sections_baselineId"`,
    );
    await queryRunner.query(
      `DO $$
       DECLARE
         current_udt_name text;
       BEGIN
         IF to_regclass('public.baseline_sections') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "baseline_sections" DROP COLUMN IF EXISTS "updatedAt"';
           EXECUTE 'ALTER TABLE "baseline_sections" DROP COLUMN IF EXISTS "title"';

           SELECT c.udt_name
           INTO current_udt_name
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'baseline_sections'
             AND c.column_name = 'type';

           IF current_udt_name IS NOT NULL THEN
             EXECUTE 'ALTER TABLE "baseline_sections" ALTER COLUMN "type" DROP DEFAULT';
           END IF;

           IF current_udt_name = 'baseline_sections_type_enum' THEN
             EXECUTE 'ALTER TABLE "baseline_sections"
                      ALTER COLUMN "type" TYPE character varying
                      USING "type"::text';
           END IF;
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       DECLARE
         enum_type_oid oid;
         enum_in_use boolean;
       BEGIN
         SELECT t.oid
         INTO enum_type_oid
         FROM pg_type t
         INNER JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'baseline_sections_type_enum'
           AND n.nspname = 'public';

         IF enum_type_oid IS NOT NULL THEN
           SELECT EXISTS (
             SELECT 1
             FROM pg_attribute a
             INNER JOIN pg_class c ON c.oid = a.attrelid
             INNER JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE a.atttypid = enum_type_oid
               AND a.attnum > 0
               AND NOT a.attisdropped
               AND c.relkind IN ('r', 'p')
               AND n.nspname NOT IN ('pg_catalog', 'information_schema')
           )
           INTO enum_in_use;

           IF NOT enum_in_use THEN
             EXECUTE 'DROP TYPE IF EXISTS "baseline_sections_type_enum"';
           END IF;
         END IF;
       END
       $$;`,
    );
  }
}
