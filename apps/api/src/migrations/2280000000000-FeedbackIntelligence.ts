import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeedbackIntelligence2280000000000 implements MigrationInterface {
  name = 'FeedbackIntelligence2280000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "feedback_items_category_enum" AS ENUM
      ('bug','confusion','trust_issue','scoring_question','generation_problem','ux_friction','feature_request','other')
    `);
    await queryRunner.query(`
      CREATE TYPE "feedback_items_triage_status_enum" AS ENUM
      ('new','reviewed','planned','resolved','closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "feedback_items_severity_enum" AS ENUM
      ('low','medium','high','critical')
    `);
    await queryRunner.query(`
      CREATE TABLE "feedback_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "analysisId" uuid NULL,
        "baselineId" uuid NULL,
        "opportunityId" uuid NULL,
        "category" "feedback_items_category_enum" NOT NULL DEFAULT 'other',
        "title" character varying(255) NOT NULL,
        "message" text NOT NULL,
        "pageContext" character varying(255) NULL,
        "metadata" jsonb NULL,
        "triageStatus" "feedback_items_triage_status_enum" NOT NULL DEFAULT 'new',
        "severity" "feedback_items_severity_enum" NOT NULL DEFAULT 'medium',
        "requiresFounderFollowup" boolean NOT NULL DEFAULT false,
        "linkedIssueKey" character varying(100) NULL,
        "adminNotes" text NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_feedback_items_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_feedback_items_user_created"
      ON "feedback_items" ("userId", "createdAt")
    `);

    await queryRunner.query(`
      CREATE TYPE "friction_events_event_type_enum" AS ENUM
      ('baseline_abandoned','low_score_no_recovery','reanalysis_available_not_used','generation_attempt_failed','repeated_generation_retry','opportunity_not_created_after_high_score','fit_review_started_not_completed','repeated_results_view_no_action')
    `);
    await queryRunner.query(`
      CREATE TYPE "friction_events_resolution_status_enum" AS ENUM
      ('open','reviewed','resolved','ignored')
    `);
    await queryRunner.query(`
      CREATE TABLE "friction_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "analysisId" uuid NULL,
        "jobId" uuid NULL,
        "baselineId" uuid NULL,
        "eventType" "friction_events_event_type_enum" NOT NULL,
        "reason" text NOT NULL,
        "metadata" jsonb NULL,
        "resolvedAt" TIMESTAMPTZ NULL,
        "resolutionStatus" "friction_events_resolution_status_enum" NOT NULL DEFAULT 'open',
        "severity" "feedback_items_severity_enum" NOT NULL DEFAULT 'medium',
        "requiresFounderFollowup" boolean NOT NULL DEFAULT false,
        "linkedIssueKey" character varying(100) NULL,
        "adminNotes" text NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_friction_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_friction_events_user_type_created"
      ON "friction_events" ("userId","eventType","createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_friction_events_user_type_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "friction_events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "friction_events_resolution_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "friction_events_event_type_enum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_feedback_items_user_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feedback_items"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "feedback_items_severity_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "feedback_items_triage_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "feedback_items_category_enum"`);
  }
}

