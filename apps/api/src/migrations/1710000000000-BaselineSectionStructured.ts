import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineSectionStructured1710000000000
  implements MigrationInterface
{
  name = 'BaselineSectionStructured1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(
      `CREATE TYPE "baseline_sections_type_enum" AS ENUM('RAW', 'SUMMARY', 'EXPERIENCE', 'PROJECT', 'SKILLS', 'EDUCATION', 'OTHER')`,
    );

    await queryRunner.query(
      `ALTER TABLE "baseline_sections" ALTER COLUMN "type" TYPE "baseline_sections_type_enum" USING upper("type")::"baseline_sections_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "baseline_sections" ALTER COLUMN "type" SET DEFAULT 'OTHER'::"baseline_sections_type_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "baseline_sections" ADD "title" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "baseline_sections" ADD "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_sections_baselineId" ON "baseline_sections" ("baselineId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_sections_orderIndex" ON "baseline_sections" ("orderIndex")`,
    );

    await queryRunner.query(
      `INSERT INTO "baseline_sections" ("id", "baselineId", "type", "title", "content", "includePolicy", "orderIndex", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), bs."baselineId", 'RAW', 'Raw', bs."content", 'never', 0, NOW(), NOW()
       FROM "baseline_sections" bs
       WHERE NOT EXISTS (
         SELECT 1 FROM "baseline_sections" existing
         WHERE existing."baselineId" = bs."baselineId" AND existing."type" = 'RAW'
       )
       GROUP BY bs."baselineId", bs."content"`,
    );

    await queryRunner.query(
      `UPDATE "baseline_sections" SET "orderIndex" = "orderIndex" + 1 WHERE "type" <> 'RAW'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "baseline_sections" SET "orderIndex" = CASE WHEN "orderIndex" > 0 THEN "orderIndex" - 1 ELSE 0 END WHERE "type" <> 'RAW'`,
    );
    await queryRunner.query(
      `DELETE FROM "baseline_sections" WHERE "type" = 'RAW'`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_baseline_sections_orderIndex"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_baseline_sections_baselineId"`);
    await queryRunner.query(`ALTER TABLE "baseline_sections" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "baseline_sections" DROP COLUMN "title"`);
    await queryRunner.query(`ALTER TABLE "baseline_sections" ALTER COLUMN "type" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "baseline_sections" ALTER COLUMN "type" TYPE character varying USING "type"::text`,
    );
    await queryRunner.query(`DROP TYPE "baseline_sections_type_enum"`);
  }
}
