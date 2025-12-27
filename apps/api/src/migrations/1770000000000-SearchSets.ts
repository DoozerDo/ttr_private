import { MigrationInterface, QueryRunner } from 'typeorm';

export class SearchSets1770000000000 implements MigrationInterface {
  name = 'SearchSets1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TYPE "search_sets_seniority_enum" AS ENUM('ENTRY', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE', 'ANY')
    `);

    await queryRunner.query(`
      CREATE TYPE "search_sets_workmode_enum" AS ENUM('REMOTE', 'HYBRID', 'ONSITE', 'ANY')
    `);

    await queryRunner.query(`
      CREATE TABLE "search_sets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "titlePatterns" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "seniority" "search_sets_seniority_enum" NOT NULL DEFAULT 'ANY',
        "industry" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "workMode" "search_sets_workmode_enum" NOT NULL DEFAULT 'ANY',
        "sourceUrl" character varying(2048),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_search_sets_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_search_sets_userId" ON "search_sets" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_search_sets_isActive" ON "search_sets" ("isActive")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_search_sets_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_search_sets_userId"`);
    await queryRunner.query(`DROP TABLE "search_sets"`);
    await queryRunner.query(`DROP TYPE "search_sets_workmode_enum"`);
    await queryRunner.query(`DROP TYPE "search_sets_seniority_enum"`);
  }
}
