import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionTierEnum1880000000000 implements MigrationInterface {
  name = 'SubscriptionTierEnum1880000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           INNER JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'subscription_tier_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "subscription_tier_enum" AS ENUM('FREE', 'PRO', 'COACH', 'ENTERPRISE');
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
                AND c.column_name = 'subscriptionTier'
            ) THEN
           SELECT c.udt_name
           INTO current_udt_name
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'users'
             AND c.column_name = 'subscriptionTier';

           IF current_udt_name <> 'subscription_tier_enum' THEN
             EXECUTE 'ALTER TABLE "users" ALTER COLUMN "subscriptionTier" DROP DEFAULT';
             EXECUTE 'ALTER TABLE "users"
                      ALTER COLUMN "subscriptionTier"
                      TYPE "subscription_tier_enum"
                      USING (
                        CASE
                          WHEN lower("subscriptionTier"::text) = ''pro'' THEN ''PRO''
                          WHEN lower("subscriptionTier"::text) = ''coach'' THEN ''COACH''
                          WHEN lower("subscriptionTier"::text) = ''enterprise'' THEN ''ENTERPRISE''
                          ELSE ''FREE''
                        END
                      )::"subscription_tier_enum"';
           END IF;

           EXECUTE 'ALTER TABLE "users" ALTER COLUMN "subscriptionTier" SET DEFAULT ''FREE''::"subscription_tier_enum"';
         END IF;
       END
       $$;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
                AND c.column_name = 'subscriptionTier'
            ) THEN
           SELECT c.udt_name
           INTO current_udt_name
           FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = 'users'
             AND c.column_name = 'subscriptionTier';

           IF current_udt_name = 'subscription_tier_enum' THEN
             EXECUTE 'ALTER TABLE "users"
                      ALTER COLUMN "subscriptionTier"
                      TYPE character varying(50)
                      USING "subscriptionTier"::text';
             EXECUTE 'ALTER TABLE "users" ALTER COLUMN "subscriptionTier" SET DEFAULT ''free''';
           END IF;
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
             AND c.udt_name = 'subscription_tier_enum'
         )
         INTO enum_in_use;

         IF NOT enum_in_use THEN
           EXECUTE 'DROP TYPE IF EXISTS "subscription_tier_enum"';
         END IF;
       END
       $$;`,
    );
  }
}
