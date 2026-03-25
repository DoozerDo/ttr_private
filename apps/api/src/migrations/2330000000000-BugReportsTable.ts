import { MigrationInterface, QueryRunner } from 'typeorm';

export class BugReportsTable2330000000000 implements MigrationInterface {
  name = 'BugReportsTable2330000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."bug_reports_status_enum" AS ENUM('OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );

    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."bug_reports_severity_enum" AS ENUM('NEW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "bug_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "reporter_email" character varying(256),
        "what_happened" text NOT NULL,
        "attempted_action" text,
        "expected_behavior" text,
        "route" text NOT NULL,
        "page_label" text,
        "app_version" character varying(128),
        "git_sha" character varying(128),
        "baseline_id" uuid,
        "assessment_id" uuid,
        "fit_score" numeric(6,2),
        "browser_info" text,
        "viewport" jsonb,
        "runtime_context" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "screenshot_storage_path" text,
        "screenshot_original_filename" character varying(255),
        "screenshot_mime_type" character varying(128),
        "screenshot_size_bytes" integer,
        "status" "public"."bug_reports_status_enum" NOT NULL DEFAULT 'OPEN',
        "severity" "public"."bug_reports_severity_enum" NOT NULL DEFAULT 'NEW',
        "triage_notes" text,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolved_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bug_reports_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bug_reports_created_at" ON "bug_reports" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bug_reports_status" ON "bug_reports" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bug_reports_severity" ON "bug_reports" ("severity")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bug_reports_user_id" ON "bug_reports" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bug_reports"
      ADD CONSTRAINT "FK_bug_reports_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bug_reports" DROP CONSTRAINT IF EXISTS "FK_bug_reports_user_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bug_reports_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bug_reports_severity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bug_reports_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bug_reports_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bug_reports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."bug_reports_severity_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."bug_reports_status_enum"`);
  }
}
