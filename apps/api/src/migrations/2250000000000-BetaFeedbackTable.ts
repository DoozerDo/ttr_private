import { MigrationInterface, QueryRunner } from 'typeorm';

export class BetaFeedbackTable2250000000000 implements MigrationInterface {
  name = 'BetaFeedbackTable2250000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."beta_feedback_severity_enum" AS ENUM('blocker', 'major', 'minor');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."beta_feedback_category_enum" AS ENUM(
          'scoring_issue',
          'hallucination',
          'formatting_resume',
          'formatting_cover_letter',
          'ux_confusion',
          'navigation_break',
          'data_missing',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "beta_feedback" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(255) NOT NULL,
        "where" character varying(255) NOT NULL,
        "actual" text NOT NULL,
        "expected" text NOT NULL,
        "severity" "public"."beta_feedback_severity_enum" NOT NULL,
        "category" "public"."beta_feedback_category_enum" NOT NULL,
        "job_description" text,
        "notes" text,
        "screenshot_url" character varying(2048),
        "user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_beta_feedback_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_feedback_created_at" ON "beta_feedback" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_feedback_severity" ON "beta_feedback" ("severity")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_feedback_category" ON "beta_feedback" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_beta_feedback_user_id" ON "beta_feedback" ("user_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "beta_feedback"
        ADD CONSTRAINT "FK_beta_feedback_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "beta_feedback" DROP CONSTRAINT IF EXISTS "FK_beta_feedback_user_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_beta_feedback_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_beta_feedback_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_beta_feedback_severity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_beta_feedback_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "beta_feedback"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."beta_feedback_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."beta_feedback_severity_enum"`);
  }
}

