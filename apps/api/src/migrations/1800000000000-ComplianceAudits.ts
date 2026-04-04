import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComplianceAudits1800000000000 implements MigrationInterface {
  name = 'ComplianceAudits1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TYPE "compliance_audits_action_enum" AS ENUM('fit_score', 'resume_gen', 'cover_letter_gen', 'application_export', 'resume_export')
    `);

    await queryRunner.query(`
      CREATE TABLE "compliance_audits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actorId" character varying NOT NULL,
        "action" "compliance_audits_action_enum" NOT NULL,
        "baselineVersionHash" character varying(255),
        "jobHash" character varying(255),
        "outputHash" character varying(255),
        "complianceFlags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "passFail" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compliance_audits_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_compliance_audits_actorId" ON "compliance_audits" ("actorId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_compliance_audits_action" ON "compliance_audits" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_compliance_audits_createdAt" ON "compliance_audits" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_compliance_audits_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_compliance_audits_action"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_compliance_audits_actorId"`,
    );
    await queryRunner.query(`DROP TABLE "compliance_audits"`);
    await queryRunner.query(`DROP TYPE "compliance_audits_action_enum"`);
  }
}
