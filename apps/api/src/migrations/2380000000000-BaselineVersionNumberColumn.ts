import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineVersionNumberColumn2380000000000
  implements MigrationInterface
{
  name = 'BaselineVersionNumberColumn2380000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN IF NOT EXISTS "versionNumber" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      UPDATE "baselines"
      SET "versionNumber" = CASE
        WHEN "versionNumber" IS NULL OR "versionNumber" < 1 THEN GREATEST("version", 1)
        ELSE "versionNumber"
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "versionNumber"
    `);
  }
}
