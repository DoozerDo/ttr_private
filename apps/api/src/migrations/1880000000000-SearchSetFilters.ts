import { MigrationInterface, QueryRunner } from 'typeorm';

export class SearchSetFilters1880000000000 implements MigrationInterface {
  name = 'SearchSetFilters1880000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_sets" RENAME COLUMN "seniority" TO "seniority_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_sets" RENAME COLUMN "workMode" TO "workMode_old"`,
    );

    await queryRunner.query(
      `ALTER TABLE "search_sets" ADD COLUMN "seniority" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );

    await queryRunner.query(
      `UPDATE "search_sets" SET "seniority" = CASE WHEN "seniority_old" IS NULL THEN '[]'::jsonb ELSE jsonb_build_array("seniority_old"::text) END`,
    );

    await queryRunner.query(
      `ALTER TABLE "search_sets" DROP COLUMN "seniority_old"`,
    );

    await queryRunner.query(
      `ALTER TABLE "search_sets" ADD COLUMN "workMode" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );

    await queryRunner.query(
      `UPDATE "search_sets" SET "workMode" = CASE WHEN "workMode_old" IS NULL THEN '[]'::jsonb ELSE jsonb_build_array("workMode_old"::text) END`,
    );

    await queryRunner.query(
      `ALTER TABLE "search_sets" DROP COLUMN "workMode_old"`,
    );

    await queryRunner.query(
      `ALTER TABLE "search_sets" ADD COLUMN "location" character varying(255)`,
    );

    await queryRunner.query(`DROP TYPE IF EXISTS "search_sets_seniority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "search_sets_workmode_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "search_sets_seniority_enum" AS ENUM('ENTRY', 'MID', 'SENIOR', 'LEAD', 'EXECUTIVE', 'ANY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "search_sets_workmode_enum" AS ENUM('REMOTE', 'HYBRID', 'ONSITE', 'ANY')`,
    );

    await queryRunner.query(
      `ALTER TABLE "search_sets" ADD COLUMN "seniority_old" "search_sets_seniority_enum" NOT NULL DEFAULT 'ANY'`,
    );
    await queryRunner.query(
      `UPDATE "search_sets" SET "seniority_old" = CASE WHEN jsonb_array_length("seniority") > 0 THEN ("seniority"->>0)::search_sets_seniority_enum ELSE 'ANY' END`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_sets" DROP COLUMN "seniority"`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_sets" RENAME COLUMN "seniority_old" TO "seniority"`,
    );

    await queryRunner.query(
      `ALTER TABLE "search_sets" ADD COLUMN "workMode_old" "search_sets_workmode_enum" NOT NULL DEFAULT 'ANY'`,
    );
    await queryRunner.query(
      `UPDATE "search_sets" SET "workMode_old" = CASE WHEN jsonb_array_length("workMode") > 0 THEN ("workMode"->>0)::search_sets_workmode_enum ELSE 'ANY' END`,
    );
    await queryRunner.query(`ALTER TABLE "search_sets" DROP COLUMN "workMode"`);
    await queryRunner.query(
      `ALTER TABLE "search_sets" RENAME COLUMN "workMode_old" TO "workMode"`,
    );

    await queryRunner.query(`ALTER TABLE "search_sets" DROP COLUMN "location"`);
  }
}
