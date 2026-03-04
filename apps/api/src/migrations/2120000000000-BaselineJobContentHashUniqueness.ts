import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineJobContentHashUniqueness2120000000000
  implements MigrationInterface
{
  name = 'BaselineJobContentHashUniqueness2120000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.baselines') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "hash" character varying(255)';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.jobs') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "dedupeHash" character varying(128)';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.baselines') IS NOT NULL THEN
          EXECUTE '
            WITH ranked AS (
              SELECT
                id,
                ROW_NUMBER() OVER (
                  PARTITION BY "userId", "hash"
                  ORDER BY "createdAt" ASC, id ASC
                ) AS rn
              FROM "baselines"
              WHERE "hash" IS NOT NULL
            )
            UPDATE "baselines" b
            SET "hash" = NULL
            FROM ranked r
            WHERE b.id = r.id
              AND r.rn > 1
          ';
          EXECUTE '
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_baselines_user_hash"
            ON "baselines" ("userId", "hash")
            WHERE "hash" IS NOT NULL
          ';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.jobs') IS NOT NULL THEN
          EXECUTE '
            WITH ranked AS (
              SELECT
                id,
                ROW_NUMBER() OVER (
                  PARTITION BY "userId", "dedupeHash"
                  ORDER BY "createdAt" ASC, id ASC
                ) AS rn
              FROM "jobs"
              WHERE "dedupeHash" IS NOT NULL
            )
            UPDATE "jobs" j
            SET "dedupeHash" = NULL
            FROM ranked r
            WHERE j.id = r.id
              AND r.rn > 1
          ';
          EXECUTE '
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_jobs_user_dedupeHash"
            ON "jobs" ("userId", "dedupeHash")
            WHERE "dedupeHash" IS NOT NULL
          ';
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_jobs_user_dedupeHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_baselines_user_hash"`);
  }
}
