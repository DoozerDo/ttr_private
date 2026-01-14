import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobsArchiveStatus2050000000000 implements MigrationInterface {
  name = 'JobsArchiveStatus2050000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN "archivedAt" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      ADD COLUMN "isArchived" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE "jobs"
      SET "isArchived" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "isArchived"
    `);

    await queryRunner.query(`
      ALTER TABLE "jobs"
      DROP COLUMN IF EXISTS "archivedAt"
    `);
  }
}
