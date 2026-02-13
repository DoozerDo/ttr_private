import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailConfirmation2090000000000 implements MigrationInterface {
  name = 'EmailConfirmation2090000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "firstName" character varying(100) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "lastName" character varying(100) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailConfirmed" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "token" character varying(64) NOT NULL,
        "type" character varying(20) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_tokens_token" UNIQUE ("token"),
        CONSTRAINT "FK_user_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_user_tokens_userId" ON "user_tokens" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_tokens_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_tokens"`);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailConfirmed"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "firstName"`);
  }
}
