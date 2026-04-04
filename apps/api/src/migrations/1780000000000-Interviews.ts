import { MigrationInterface, QueryRunner } from 'typeorm';

export class Interviews1780000000000 implements MigrationInterface {
  name = 'Interviews1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" character varying(255) NOT NULL,
        "baselineId" character varying(255) NOT NULL,
        "jobId" character varying(255),
        "status" character varying(64) NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_sessions_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_responses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sessionId" uuid NOT NULL,
        "question" text NOT NULL,
        "response" text NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_responses_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_responses_session" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_interview_sessions_userId" ON "interview_sessions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_interview_responses_sessionId" ON "interview_responses" ("sessionId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_interview_responses_sessionId"`,
    );
    await queryRunner.query(`DROP TABLE "interview_responses"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_interview_sessions_userId"`,
    );
    await queryRunner.query(`DROP TABLE "interview_sessions"`);
  }
}
