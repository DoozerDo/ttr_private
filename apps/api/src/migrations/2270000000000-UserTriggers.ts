import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserTriggers2270000000000 implements MigrationInterface {
  name = 'UserTriggers2270000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_triggers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "triggerType" character varying(64) NOT NULL,
        "priority" character varying(16) NOT NULL,
        "reason" text NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_triggers_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_triggers_user_type_created"
      ON "user_triggers" ("userId", "triggerType", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_user_triggers_user_type_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_triggers"`);
  }
}

