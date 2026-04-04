import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountTypeAndAdminUsers1890000000000 implements MigrationInterface {
  name = 'AccountTypeAndAdminUsers1890000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           INNER JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'account_type_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "account_type_enum" AS ENUM('free', 'paid');
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       DECLARE
         current_udt_name text;
       BEGIN
         IF to_regclass('public.users') IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM information_schema.columns c
              WHERE c.table_schema = 'public'
                AND c.table_name = 'users'
                AND c.column_name = 'accountType'
            ) THEN
           SELECT c.udt_name
           INTO current_udt_name
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'users'
             AND c.column_name = 'accountType';

           IF current_udt_name = 'account_type_enum' THEN
             EXECUTE 'ALTER TABLE "users" ALTER COLUMN "accountType" SET DEFAULT ''free''::"account_type_enum"';
           END IF;
         ELSIF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accountType" "account_type_enum" NOT NULL DEFAULT ''free''::"account_type_enum"';
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "admin_users" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "userId" uuid NOT NULL,
         "role" character varying(50) NOT NULL DEFAULT 'admin',
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_admin_users" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_admin_users_userId" UNIQUE ("userId")
       )`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.admin_users') IS NOT NULL
            AND to_regclass('public.users') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'FK_admin_users_userId'
            ) THEN
           ALTER TABLE "admin_users"
           ADD CONSTRAINT "FK_admin_users_userId"
           FOREIGN KEY ("userId") REFERENCES "users" ("id")
           ON DELETE CASCADE;
         END IF;
       END
       $$;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_users" DROP CONSTRAINT IF EXISTS "FK_admin_users_userId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_users"`);
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "accountType"';
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
             AND c.udt_name = 'account_type_enum'
         )
         INTO enum_in_use;

         IF NOT enum_in_use THEN
           EXECUTE 'DROP TYPE IF EXISTS "account_type_enum"';
         END IF;
       END
       $$;`,
    );
  }
}
