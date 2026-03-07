import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessCodesUpdatedAt2210000000000 implements MigrationInterface {
  name = 'AccessCodesUpdatedAt2210000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.access_codes') IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'access_codes'
              AND column_name = 'updatedAt'
          ) THEN
            ALTER TABLE "access_codes"
              ADD COLUMN "updatedAt" TIMESTAMP WITH TIME ZONE;
          END IF;

          UPDATE "access_codes"
          SET "updatedAt" = COALESCE("updatedAt", "createdAt", now())
          WHERE "updatedAt" IS NULL;

          ALTER TABLE "access_codes"
            ALTER COLUMN "updatedAt" SET NOT NULL;

          ALTER TABLE "access_codes"
            ALTER COLUMN "updatedAt" SET DEFAULT now();
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.access_codes') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'access_codes'
              AND column_name = 'updatedAt'
          ) THEN
            ALTER TABLE "access_codes" DROP COLUMN "updatedAt";
          END IF;
        END IF;
      END
      $$;
    `);
  }
}
