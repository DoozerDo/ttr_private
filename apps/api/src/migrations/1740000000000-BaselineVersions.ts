import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineVersions1740000000000 implements MigrationInterface {
  name = 'BaselineVersions1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(
      `CREATE TABLE "baseline_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "baselineId" uuid NOT NULL,
        "versionNumber" integer NOT NULL,
        "fileHash" character varying(255),
        "storagePath" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_baseline_versions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_baseline_versions_baselineId" FOREIGN KEY ("baselineId") REFERENCES "baselines"("id") ON DELETE CASCADE
      )`,
    );

    // VERIFY: Confirm per-baseline uniqueness for version numbers is desired.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_baseline_versions_baselineId_versionNumber" ON "baseline_versions" ("baselineId", "versionNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_baseline_versions_baselineId" ON "baseline_versions" ("baselineId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_versions_baselineId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baseline_versions_baselineId_versionNumber"`,
    );
    await queryRunner.query(`DROP TABLE "baseline_versions"`);
  }
}
