import { MigrationInterface, QueryRunner } from 'typeorm';

export class FitAssessmentsScoringReliability2460000000000
  implements MigrationInterface
{
  name = 'FitAssessmentsScoringReliability2460000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fit_assessments" ADD COLUMN IF NOT EXISTS "scoringReliability" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "fit_assessments" ADD COLUMN IF NOT EXISTS "scoringReliabilityReason" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fit_assessments" DROP COLUMN IF EXISTS "scoringReliabilityReason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fit_assessments" DROP COLUMN IF EXISTS "scoringReliability"`,
    );
  }
}

