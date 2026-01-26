import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserCalibrationProfile1750000000000 implements MigrationInterface {
  name = 'UserCalibrationProfile1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "calibrationProfileName" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "calibrationWeights" jsonb`,
    );
    // VERIFY: Confirm null defaults cover existing users without calibration data.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "calibrationWeights"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "calibrationProfileName"`,
    );
  }
}
