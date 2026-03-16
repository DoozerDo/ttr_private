import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineScoreHistoryPersistence2240000000000
  implements MigrationInterface
{
  name = 'BaselineScoreHistoryPersistence2240000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "originalBaselineScore" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "latestBaselineScore" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "firstAnalyzedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "lastAnalyzedAt" TIMESTAMP WITH TIME ZONE`,
    );

    await queryRunner.query(
      `UPDATE "baselines"
       SET "originalBaselineScore" = "latestBaselineScore"
       WHERE "latestBaselineScore" IS NOT NULL
         AND "originalBaselineScore" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baselines" DROP COLUMN IF EXISTS "lastAnalyzedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "baselines" DROP COLUMN IF EXISTS "firstAnalyzedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "baselines" DROP COLUMN IF EXISTS "latestBaselineScore"`,
    );
    await queryRunner.query(
      `ALTER TABLE "baselines" DROP COLUMN IF EXISTS "originalBaselineScore"`,
    );
  }
}
