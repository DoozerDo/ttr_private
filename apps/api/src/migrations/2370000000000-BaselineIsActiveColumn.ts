import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineIsActiveColumn2370000000000
  implements MigrationInterface
{
  name = 'BaselineIsActiveColumn2370000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baselines" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baselines" DROP COLUMN IF EXISTS "isActive"`,
    );
  }
}
