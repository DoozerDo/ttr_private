import { MigrationInterface, QueryRunner } from 'typeorm';

export class SearchSetUrlSupport1810000000000 implements MigrationInterface {
  name = 'SearchSetUrlSupport1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_sets" ADD "urlBacked" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_sets" ADD "parseWarning" character varying(1024)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "search_sets" DROP COLUMN "parseWarning"`,
    );
    await queryRunner.query(
      `ALTER TABLE "search_sets" DROP COLUMN "urlBacked"`,
    );
  }
}
