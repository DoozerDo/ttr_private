import { MigrationInterface, QueryRunner } from 'typeorm';

export class AnalyticsEvents2230000000000 implements MigrationInterface {
  name = 'AnalyticsEvents2230000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "event_name" varchar(64) NOT NULL,
        "session_id" varchar(128) NOT NULL,
        "user_id" uuid,
        "path" varchar(512),
        "properties" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_analytics_events_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_event_name"
      ON "analytics_events" ("event_name")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_session_id"
      ON "analytics_events" ("session_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_created_at"
      ON "analytics_events" ("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_analytics_events_user_id"
      ON "analytics_events" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_analytics_events_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_analytics_events_created_at"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_analytics_events_session_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_analytics_events_event_name"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "analytics_events"
    `);
  }
}
