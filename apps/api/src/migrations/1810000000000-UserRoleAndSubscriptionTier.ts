import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserRoleAndSubscriptionTier1810000000000 implements MigrationInterface {
  name = 'UserRoleAndSubscriptionTier1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" character varying(50) NOT NULL DEFAULT ''user''';
           EXECUTE 'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionTier" character varying(50) NOT NULL DEFAULT ''free''';
         END IF;
       END
       $$;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "subscriptionTier"';
           EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "role"';
         END IF;
       END
       $$;`,
    );
  }
}
