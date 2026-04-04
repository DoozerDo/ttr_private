import { MigrationInterface, QueryRunner } from 'typeorm';

export class Opportunities2200000000000 implements MigrationInterface {
  name = 'Opportunities2200000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TYPE "opportunities_status_enum" AS ENUM(
        'SAVED',
        'APPLIED',
        'RECRUITER_SCREEN',
        'HIRING_MANAGER',
        'LOOP',
        'OFFER',
        'REJECTED',
        'WITHDRAWN',
        'IN_FIT_REVIEW',
        'DORMANT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "opportunities_fit_band_enum" AS ENUM(
        'FIT_REVIEW',
        'VIABLE',
        'STRONG',
        'ELITE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "opportunities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "company_name" character varying(255) NOT NULL,
        "job_title" character varying(255) NOT NULL,
        "salary" character varying(255),
        "date_created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_status_change" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "status" "opportunities_status_enum" NOT NULL,
        "initial_score" integer NOT NULL,
        "current_score" integer NOT NULL,
        "initial_band" "opportunities_fit_band_enum" NOT NULL,
        "current_band" "opportunities_fit_band_enum" NOT NULL,
        "baseline_version_used" character varying,
        "dormant" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_opportunities_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_opportunities_user_id" ON "opportunities" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_opportunities_company_name" ON "opportunities" ("company_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_opportunities_current_band" ON "opportunities" ("current_band")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_opportunities_last_status_change" ON "opportunities" ("last_status_change")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_opportunities_last_status_change"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_opportunities_current_band"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_opportunities_company_name"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_opportunities_user_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "opportunities"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "opportunities_fit_band_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "opportunities_status_enum"`);
  }
}

