import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioArtifactsTable2430000000000 implements MigrationInterface {
  name = 'StudioArtifactsTable2430000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "studio_artifacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "baselineId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "baselineVersionId" uuid,
        "baselineVersionHash" character varying(255),
        "jobFingerprint" character varying(255),
        "generationContractVersion" character varying(64),
        "resumeStatus" character varying(32) NOT NULL DEFAULT 'MISSING',
        "coverLetterStatus" character varying(32) NOT NULL DEFAULT 'MISSING',
        "resumeInputsHash" character varying(255),
        "coverLetterInputsHash" character varying(255),
        "resumeResponseBody" jsonb,
        "coverLetterResponseBody" jsonb,
        "resumeContent" text,
        "coverLetterContent" text,
        "resumeFailureCode" character varying(255),
        "coverLetterFailureCode" character varying(255),
        "resumeFailureMessage" text,
        "coverLetterFailureMessage" text,
        "resumeGenerationStartedAt" TIMESTAMP WITH TIME ZONE,
        "coverLetterGenerationStartedAt" TIMESTAMP WITH TIME ZONE,
        "resumeGeneratedAt" TIMESTAMP WITH TIME ZONE,
        "coverLetterGeneratedAt" TIMESTAMP WITH TIME ZONE,
        "resumeFailedAt" TIMESTAMP WITH TIME ZONE,
        "coverLetterFailedAt" TIMESTAMP WITH TIME ZONE,
        "resumeMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "coverLetterMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_studio_artifacts_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_studio_artifacts_scope"
      ON "studio_artifacts" ("userId", "baselineId", "jobId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_studio_artifacts_resume_status"
      ON "studio_artifacts" ("resumeStatus")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_studio_artifacts_cover_status"
      ON "studio_artifacts" ("coverLetterStatus")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_studio_artifacts_cover_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_studio_artifacts_resume_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_studio_artifacts_scope"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "studio_artifacts"`);
  }
}
