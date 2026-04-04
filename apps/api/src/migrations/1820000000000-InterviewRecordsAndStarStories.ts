import { MigrationInterface, QueryRunner } from 'typeorm';

export class InterviewRecordsAndStarStories1820000000000 implements MigrationInterface {
  name = 'InterviewRecordsAndStarStories1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE "interviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" character varying(255) NOT NULL,
        "jobId" character varying(255) NOT NULL,
        "gapList" jsonb NOT NULL DEFAULT '[]',
        "questions" jsonb NOT NULL DEFAULT '[]',
        "responses" jsonb NOT NULL DEFAULT '[]',
        "validationResults" jsonb NOT NULL DEFAULT '{}',
        "recommendedAdditions" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interviews_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_interviews_userId" ON "interviews" ("userId")`,
    );

    await queryRunner.query(`
      CREATE TABLE "star_stories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" character varying(255) NOT NULL,
        "title" character varying(255) NOT NULL,
        "situation" text NOT NULL,
        "task" text NOT NULL,
        "action" text NOT NULL,
        "result" text NOT NULL,
        "reflections" text,
        "competencies" jsonb NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_star_stories_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_star_stories_userId" ON "star_stories" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_star_stories_userId"`);
    await queryRunner.query(`DROP TABLE "star_stories"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_interviews_userId"`);
    await queryRunner.query(`DROP TABLE "interviews"`);
  }
}
