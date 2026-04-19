import { MigrationInterface, QueryRunner } from 'typeorm';

// Corrective migration for schema drift:
// Some environments have earlier migrations marked as applied, but the live
// schema is missing `users.betaAccessApproved`. This migration is intentionally
// idempotent and safe to run repeatedly.
export class BetaAccessApprovedRepair2450000000000
  implements MigrationInterface
{
  name = 'BetaAccessApprovedRepair2450000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.users') IS NULL THEN
          RETURN;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = 'betaAccessApproved'
        ) THEN
          ALTER TABLE "users"
            ADD COLUMN "betaAccessApproved" boolean NOT NULL DEFAULT false;
        END IF;

        -- Ensure any drifted nullable column is aligned with app expectations.
        UPDATE "users"
          SET "betaAccessApproved" = false
          WHERE "betaAccessApproved" IS NULL;

        ALTER TABLE "users"
          ALTER COLUMN "betaAccessApproved" SET DEFAULT false;

        ALTER TABLE "users"
          ALTER COLUMN "betaAccessApproved" SET NOT NULL;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally non-destructive: do not drop the column on down.
  }
}

