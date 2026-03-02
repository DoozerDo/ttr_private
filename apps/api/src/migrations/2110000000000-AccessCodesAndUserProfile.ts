import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessCodesAndUserProfile2110000000000
  implements MigrationInterface
{
  name = 'AccessCodesAndUserProfile2110000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "betaAccessApproved"';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.beta_access_codes') IS NOT NULL
            AND to_regclass('public.access_codes') IS NULL THEN
           EXECUTE 'ALTER TABLE "beta_access_codes" RENAME TO "access_codes"';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.access_codes') IS NOT NULL THEN
           IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PK_beta_access_codes_id') THEN
             EXECUTE 'ALTER TABLE "access_codes" RENAME CONSTRAINT "PK_beta_access_codes_id" TO "PK_access_codes_id"';
           END IF;
           IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UQ_beta_access_codes_codeHash') THEN
             EXECUTE 'ALTER TABLE "access_codes" RENAME CONSTRAINT "UQ_beta_access_codes_codeHash" TO "UQ_access_codes_codeHash"';
           END IF;
           IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_createdBy') THEN
             EXECUTE 'ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_createdBy" TO "FK_access_codes_createdBy"';
           END IF;
           IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_assigned') THEN
             EXECUTE 'ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_assigned" TO "FK_access_codes_assigned"';
           END IF;
           IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_redeemedBy') THEN
             EXECUTE 'ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_redeemedBy" TO "FK_access_codes_redeemedBy"';
           END IF;
           IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_revokedBy') THEN
             EXECUTE 'ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_revokedBy" TO "FK_access_codes_revokedBy"';
           END IF;
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.IDX_beta_access_codes_assignedUserId') IS NOT NULL THEN
           EXECUTE 'ALTER INDEX "IDX_beta_access_codes_assignedUserId" RENAME TO "IDX_access_codes_assignedUserId"';
         END IF;
         IF to_regclass('public.IDX_beta_access_codes_redeemedAt') IS NOT NULL THEN
           EXECUTE 'ALTER INDEX "IDX_beta_access_codes_redeemedAt" RENAME TO "IDX_access_codes_redeemedAt"';
         END IF;
         IF to_regclass('public.IDX_beta_access_codes_revokedAt') IS NOT NULL THEN
           EXECUTE 'ALTER INDEX "IDX_beta_access_codes_revokedAt" RENAME TO "IDX_access_codes_revokedAt"';
         END IF;
         IF to_regclass('public.IDX_beta_access_codes_createdAt') IS NOT NULL THEN
           EXECUTE 'ALTER INDEX "IDX_beta_access_codes_createdAt" RENAME TO "IDX_access_codes_createdAt"';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roleTitle" character varying(150)';
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company" character varying(150)';
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "linkedinUrl" character varying(255)';
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "intendedUse" character varying(255)';
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profileCompletedAt" TIMESTAMP WITH TIME ZONE';
         END IF;
       END
       $$;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profileCompletedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "intendedUse"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "linkedinUrl"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "company"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "roleTitle"`);

    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_createdAt" RENAME TO "IDX_beta_access_codes_createdAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_revokedAt" RENAME TO "IDX_beta_access_codes_revokedAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_redeemedAt" RENAME TO "IDX_beta_access_codes_redeemedAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_assignedUserId" RENAME TO "IDX_beta_access_codes_assignedUserId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_revokedBy" TO "FK_beta_access_codes_revokedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_redeemedBy" TO "FK_beta_access_codes_redeemedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_assigned" TO "FK_beta_access_codes_assigned"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_createdBy" TO "FK_beta_access_codes_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "UQ_access_codes_codeHash" TO "UQ_beta_access_codes_codeHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "PK_access_codes_id" TO "PK_beta_access_codes_id"`,
    );

    await queryRunner.query(`ALTER TABLE "access_codes" RENAME TO "beta_access_codes"`);

    await queryRunner.query(
      `ALTER TABLE "users" ADD "betaAccessApproved" boolean NOT NULL DEFAULT false`,
    );
  }
}
