import { MigrationInterface, QueryRunner } from 'typeorm';

export class RealityChecks1900000000000 implements MigrationInterface {
  name = 'RealityChecks1900000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(
      `CREATE TYPE "reality_checks_outcome_enum" AS ENUM('valid', 'update_recommended', 'mismatch')`,
    );
    await queryRunner.query(`
      CREATE TABLE "reality_checks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "jobId" uuid NOT NULL,
        "baselineId" uuid NOT NULL,
        "triggeredBy" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "answers" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "outcome" "reality_checks_outcome_enum" NOT NULL,
        "baselineUpdateSuggested" boolean NOT NULL DEFAULT false,
        "suggestedBaselineSections" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reality_checks_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reality_checks"`);
    await queryRunner.query(`DROP TYPE "reality_checks_outcome_enum"`);
  }
}
