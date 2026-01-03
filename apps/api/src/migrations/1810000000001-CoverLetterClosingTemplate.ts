import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoverLetterClosingTemplate1810000000001 implements MigrationInterface {
  name = 'CoverLetterClosingTemplate1810000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cover_letters" ADD "closingTemplateKey" character varying(50) NOT NULL DEFAULT 'steady'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cover_letters" DROP COLUMN "closingTemplateKey"`,
    );
  }
}
