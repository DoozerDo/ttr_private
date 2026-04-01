import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStudioResumeFocusDefaultToUsers2120000000000
  implements MigrationInterface
{
  name = 'AddStudioResumeFocusDefaultToUsers2120000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "studioResumeFocusDefault" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "studioResumeFocusDefault"`,
    );
  }
}
