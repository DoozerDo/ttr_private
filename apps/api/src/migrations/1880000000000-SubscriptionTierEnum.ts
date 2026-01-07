import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionTierEnum1880000000000 implements MigrationInterface {
  name = 'SubscriptionTierEnum1880000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "subscription_tier_enum" AS ENUM('FREE','PRO','COACH','ENTERPRISE')`,
    );

    await queryRunner.query(
      `ALTER TABLE "users"
       ALTER COLUMN "subscriptionTier"
       TYPE "subscription_tier_enum"
       USING CASE
         WHEN lower("subscriptionTier") = 'pro' THEN 'PRO'
         WHEN lower("subscriptionTier") = 'coach' THEN 'COACH'
         WHEN lower("subscriptionTier") = 'enterprise' THEN 'ENTERPRISE'
         ELSE 'FREE'
       END`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "subscriptionTier" SET DEFAULT 'FREE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
       ALTER COLUMN "subscriptionTier"
       TYPE character varying(50)
       USING "subscriptionTier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "subscriptionTier" SET DEFAULT 'free'`,
    );
    await queryRunner.query(`DROP TYPE "subscription_tier_enum"`);
  }
}
