import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineParsed2070000000000 implements MigrationInterface {
  name = 'BaselineParsed2070000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "baseline_parsed" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "baselineId" uuid NOT NULL,
        "sourceFileId" uuid NOT NULL,
        "schemaVersion" character varying(255) NOT NULL DEFAULT 'baseline_schema_v1',
        "sourceFormat" character varying(64) NOT NULL,
        "ingestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "parsedJson" jsonb NOT NULL,
        "flagsJson" jsonb NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_baseline_parsed_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_baseline_parsed_baseline" FOREIGN KEY ("baselineId") REFERENCES "baselines" ("id") ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "baseline_parsed"`);
  }
}
