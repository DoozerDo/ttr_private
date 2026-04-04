import { MigrationInterface, QueryRunner } from 'typeorm';

export class FitAssessmentsScoringV22080000000000 implements MigrationInterface {
  name = 'FitAssessmentsScoringV22080000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fit_assessments" ADD "scoringV2" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fit_assessments" DROP COLUMN "scoringV2"`,
    );
  }
}
