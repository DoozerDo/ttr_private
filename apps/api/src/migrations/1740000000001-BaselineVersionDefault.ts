import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineVersionDefault1740000000001 implements MigrationInterface {
  name = 'BaselineVersionDefault1740000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baselines" ALTER COLUMN "version" SET DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "baselines" ALTER COLUMN "version" SET DEFAULT 1`,
    );
  }
}
