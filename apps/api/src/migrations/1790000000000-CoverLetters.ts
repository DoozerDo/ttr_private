import { MigrationInterface, QueryRunner } from 'typeorm';

export class CoverLetters1790000000000 implements MigrationInterface {
  name = 'CoverLetters1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE "cover_letters" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "jobId" uuid NOT NULL,
        "baselineId" uuid NOT NULL,
        "generatorType" character varying NOT NULL DEFAULT 'template',
        "generatorVersion" character varying NOT NULL DEFAULT 'v1',
        "content" text NOT NULL,
        "generationInputsHash" character varying(255),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cover_letters_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_cover_letters_userId" ON "cover_letters" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cover_letters_jobId" ON "cover_letters" ("jobId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cover_letters_baselineId" ON "cover_letters" ("baselineId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cover_letters_createdAt" ON "cover_letters" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cover_letters_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cover_letters_baselineId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cover_letters_jobId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cover_letters_userId"`,
    );
    await queryRunner.query(`DROP TABLE "cover_letters"`);
  }
}
