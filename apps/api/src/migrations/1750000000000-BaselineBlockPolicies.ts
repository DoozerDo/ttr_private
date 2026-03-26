import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineBlockPolicies1750000000000 implements MigrationInterface {
  name = 'BaselineBlockPolicies1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'baseline_block_policies';
    const tableExists = await queryRunner.hasTable(tableName);

    if (!tableExists) {
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      await queryRunner.query(`
        CREATE TABLE "baseline_block_policies" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "baselineVersionId" uuid NOT NULL,
          "baselineSectionId" uuid NOT NULL,
          "includePolicy" character varying NOT NULL DEFAULT 'optional',
          "orderIndex" integer NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_baseline_block_policies_id" PRIMARY KEY ("id"),
          CONSTRAINT "FK_baseline_block_policies_version" FOREIGN KEY ("baselineVersionId") REFERENCES "baseline_versions"("id") ON DELETE CASCADE,
          CONSTRAINT "FK_baseline_block_policies_section" FOREIGN KEY ("baselineSectionId") REFERENCES "baseline_sections"("id") ON DELETE CASCADE
        )
      `);
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_block_policies_version" ON "baseline_block_policies" ("baselineVersionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_block_policies_section" ON "baseline_block_policies" ("baselineSectionId")`,
    );

    await queryRunner.query(`
      INSERT INTO "baseline_block_policies" (
        "id", "baselineVersionId", "baselineSectionId", "includePolicy", "orderIndex", "createdAt", "updatedAt"
      )
      SELECT gen_random_uuid(), bv."id", bs."id", bs."includePolicy", bs."orderIndex", NOW(), NOW()
      FROM "baseline_versions" bv
      INNER JOIN "baseline_sections" bs ON bs."baselineId" = bv."baselineId"
      WHERE NOT EXISTS (
        SELECT 1 FROM "baseline_block_policies" existing
        WHERE existing."baselineVersionId" = bv."id" AND existing."baselineSectionId" = bs."id"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_block_policies_section"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_block_policies_version"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "baseline_block_policies"`);
  }
}
