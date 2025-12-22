import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobDescriptionNormalization1722000000000
  implements MigrationInterface
{
  name = 'JobDescriptionNormalization1722000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "jobs_jdIngestionMethod_enum" AS ENUM('PASTE', 'URL')`,
    );

    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "sourceUrl" character varying(2048)`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "normalizedResponsibilities" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "normalizedRequirements" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "jdIngestionMethod" "jobs_jdIngestionMethod_enum" NOT NULL DEFAULT 'PASTE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" ADD "jdParsedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "jdParsedAt"`);
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP COLUMN "jdIngestionMethod"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP COLUMN "normalizedRequirements"`,
    );
    await queryRunner.query(
      `ALTER TABLE "jobs" DROP COLUMN "normalizedResponsibilities"`,
    );
    await queryRunner.query(`ALTER TABLE "jobs" DROP COLUMN "sourceUrl"`);
    await queryRunner.query(`DROP TYPE "jobs_jdIngestionMethod_enum"`);
  }
}
