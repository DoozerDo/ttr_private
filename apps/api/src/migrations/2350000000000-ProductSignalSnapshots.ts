import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductSignalSnapshots2350000000000 implements MigrationInterface {
  name = 'ProductSignalSnapshots2350000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "product_signal_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "selected_window_days" integer NOT NULL, "headline" text NOT NULL, "tone" character varying(32) NOT NULL, "primary_focus" character varying(64) NOT NULL, "weakest_step_label" text, "weakest_step_rate" numeric(18,8) NOT NULL, "weakest_step_direction" character varying(32) NOT NULL, "watchlist_status" character varying(32) NOT NULL, "watchlist_priority" character varying(32) NOT NULL, "severity" character varying(32) NOT NULL, "confidence" character varying(32) NOT NULL, "recommended_action_title" text, "recommended_action_body" text NOT NULL, "release_context_summary" text NOT NULL, "export_payload_json" text NOT NULL, CONSTRAINT "PK_product_signal_snapshots_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_signal_snapshots_created_at" ON "product_signal_snapshots" ("created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_signal_snapshots_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_signal_snapshots"`);
  }
}
