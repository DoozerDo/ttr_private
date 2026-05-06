import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineParsedResumeV2Json2470000000000 implements MigrationInterface {
  name = 'BaselineParsedResumeV2Json2470000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baseline_parsed" ADD COLUMN IF NOT EXISTS "resumeV2Json" jsonb NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baseline_parsed" DROP COLUMN IF EXISTS "resumeV2Json"`,
    );
  }
}

