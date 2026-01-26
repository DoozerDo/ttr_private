import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineArchiveStatus2040000000000 implements MigrationInterface {
  name = 'BaselineArchiveStatus2040000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "baseline_status_enum" AS ENUM('ACTIVE', 'ARCHIVED')
    `);

    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN "status" "baseline_status_enum" NOT NULL DEFAULT 'ACTIVE'
    `);

    await queryRunner.query(`
      ALTER TABLE "baselines"
      ADD COLUMN "archivedAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      UPDATE "baselines"
      SET "status" = 'ACTIVE', "archivedAt" = NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_baselines_userId_status_createdAt"
      ON "baselines" ("userId", "status", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_baselines_userId_status_createdAt"`,
    );
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "archivedAt"
    `);
    await queryRunner.query(`
      ALTER TABLE "baselines"
      DROP COLUMN IF EXISTS "status"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "baseline_status_enum"`);
  }
}
