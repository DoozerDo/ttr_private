import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserRoleAndSubscriptionTier1810000000000 implements MigrationInterface {
  name = 'UserRoleAndSubscriptionTier1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" character varying(50) NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "subscriptionTier" character varying(50) NOT NULL DEFAULT 'free'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "subscriptionTier"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
  }
}
