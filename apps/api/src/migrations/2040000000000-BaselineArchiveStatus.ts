import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineArchiveStatus2040000000000 implements MigrationInterface {
  name = 'BaselineArchiveStatus2040000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          INNER JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'baseline_status_enum'
            AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "baseline_status_enum" AS ENUM('ACTIVE', 'ARCHIVED');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.baselines') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "status" "baseline_status_enum" NOT NULL DEFAULT ''ACTIVE''';
          EXECUTE 'ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE';
          EXECUTE 'UPDATE "baselines" SET "status" = ''ACTIVE'', "archivedAt" = NULL';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_baselines_userId_status_createdAt"
      ON "baselines" ("userId", "status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baselines_userId_status_createdAt"`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.baselines') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "baselines" DROP COLUMN IF EXISTS "archivedAt"';
          EXECUTE 'ALTER TABLE "baselines" DROP COLUMN IF EXISTS "status"';
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      DECLARE
        enum_in_use boolean;
      BEGIN
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns c
          WHERE c.udt_schema = 'public'
            AND c.udt_name = 'baseline_status_enum'
        ) INTO enum_in_use;

        IF NOT enum_in_use THEN
          EXECUTE 'DROP TYPE IF EXISTS "baseline_status_enum"';
        END IF;
      END
      $$;
    `);
  }
}
