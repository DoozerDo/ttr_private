import { MigrationInterface, QueryRunner } from 'typeorm';

export class BetaAccessCodes2100000000000 implements MigrationInterface {
  name = 'BetaAccessCodes2100000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "betaAccessApproved" boolean NOT NULL DEFAULT false';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "beta_access_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "codeHash" character varying(128) NOT NULL,
        "codePrefix" character varying(16),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "createdByUserId" uuid,
        "assignedUserId" uuid,
        "redeemedByUserId" uuid,
        "redeemedAt" TIMESTAMP WITH TIME ZONE,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "revokedByUserId" uuid,
        "notes" character varying(255),
        CONSTRAINT "PK_beta_access_codes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_beta_access_codes_codeHash" UNIQUE ("codeHash")
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.beta_access_codes') IS NOT NULL
           AND to_regclass('public.users') IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_createdBy') THEN
            ALTER TABLE "beta_access_codes" ADD CONSTRAINT "FK_beta_access_codes_createdBy" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_assigned') THEN
            ALTER TABLE "beta_access_codes" ADD CONSTRAINT "FK_beta_access_codes_assigned" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_redeemedBy') THEN
            ALTER TABLE "beta_access_codes" ADD CONSTRAINT "FK_beta_access_codes_redeemedBy" FOREIGN KEY ("redeemedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_beta_access_codes_revokedBy') THEN
            ALTER TABLE "beta_access_codes" ADD CONSTRAINT "FK_beta_access_codes_revokedBy" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL;
          END IF;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_access_codes_assignedUserId" ON "beta_access_codes" ("assignedUserId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_access_codes_redeemedAt" ON "beta_access_codes" ("redeemedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_access_codes_revokedAt" ON "beta_access_codes" ("revokedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_access_codes_createdAt" ON "beta_access_codes" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_beta_access_codes_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_beta_access_codes_revokedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_beta_access_codes_redeemedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_beta_access_codes_assignedUserId"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "beta_access_codes"`);
    await queryRunner.query(`DO $$
      BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "betaAccessApproved"';
        END IF;
      END
      $$;`);
  }
}
