import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLastAssessment2180000000000 implements MigrationInterface {
  name = 'UserLastAssessment2180000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "lastAssessmentId" uuid;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.users') IS NOT NULL THEN
          ALTER TABLE "users"
          DROP COLUMN IF EXISTS "lastAssessmentId";
        END IF;
      END
      $$;
    `);
  }
}
