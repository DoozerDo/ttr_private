import { MigrationInterface, QueryRunner } from 'typeorm';

export class InterviewAcceptedAddition2030000000000 implements MigrationInterface {
  name = 'InterviewAcceptedAddition2030000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "interview_accepted_additions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "interviewId" uuid NOT NULL,
        "gapId" character varying(255) NOT NULL,
        "category" character varying(255),
        "domain" character varying(255),
        "suggestion" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'ACCEPTED',
        "recommendedAdditionId" character varying(255),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_accepted_additions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_accepted_additions_interviewId" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_interview_accepted_additions_interviewId" ON "interview_accepted_additions" ("interviewId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_interview_accepted_additions_interviewId"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "interview_accepted_additions"`,
    );
  }
}
