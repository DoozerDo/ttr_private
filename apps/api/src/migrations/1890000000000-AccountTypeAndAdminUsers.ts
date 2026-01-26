import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountTypeAndAdminUsers1890000000000 implements MigrationInterface {
  name = 'AccountTypeAndAdminUsers1890000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(
      `CREATE TYPE "account_type_enum" AS ENUM('free','paid')`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD "accountType" "account_type_enum" NOT NULL DEFAULT 'free'`,
    );

    await queryRunner.query(
      `CREATE TABLE "admin_users" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "userId" uuid NOT NULL,
         "role" character varying(50) NOT NULL DEFAULT 'admin',
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_admin_users" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_admin_users_userId" UNIQUE ("userId")
       )`,
    );

    await queryRunner.query(
      `ALTER TABLE "admin_users"
       ADD CONSTRAINT "FK_admin_users_userId"
       FOREIGN KEY ("userId") REFERENCES "users" ("id")
       ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_users" DROP CONSTRAINT "FK_admin_users_userId"`,
    );
    await queryRunner.query(`DROP TABLE "admin_users"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "accountType"`);
    await queryRunner.query(`DROP TYPE "account_type_enum"`);
  }
}
