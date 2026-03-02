import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailConfirmation2090000000000 implements MigrationInterface {
  name = 'EmailConfirmation2090000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "firstName" character varying(100) NOT NULL DEFAULT '';
           ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastName" character varying(100) NOT NULL DEFAULT '';
           ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailConfirmed" boolean NOT NULL DEFAULT false;
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "token" character varying(64) NOT NULL,
        "type" character varying(20) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_tokens_token" UNIQUE ("token")
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.user_tokens') IS NOT NULL
           AND to_regclass('public.users') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_tokens_user'
           ) THEN
          ALTER TABLE "user_tokens"
          ADD CONSTRAINT "FK_user_tokens_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_tokens_userId" ON "user_tokens" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_tokens_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_tokens"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "emailConfirmed"';
          EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "lastName"';
          EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "firstName"';
        END IF;
      END
      $$;
    `);
  }
}
