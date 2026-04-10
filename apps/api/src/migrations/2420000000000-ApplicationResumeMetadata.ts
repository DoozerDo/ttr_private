import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationResumeMetadata2420000000000
  implements MigrationInterface
{
  name = 'ApplicationResumeMetadata2420000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "verificationCoverageSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      ADD COLUMN IF NOT EXISTS "outcomeLinkageSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "outcomeLinkageSnapshot"
    `);

    await queryRunner.query(`
      ALTER TABLE "applications"
      DROP COLUMN IF EXISTS "verificationCoverageSnapshot"
    `);
  }
}
