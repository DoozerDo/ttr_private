import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserCalibrationProfile1750000000000 implements MigrationInterface {
  name = 'UserCalibrationProfile1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           INNER JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'users_subscriptionTier_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "users_subscriptionTier_enum" AS ENUM('FREE', 'PRO', 'COACH', 'ENTERPRISE');
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_type t
           INNER JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typname = 'users_accountType_enum'
             AND n.nspname = 'public'
         ) THEN
           CREATE TYPE "users_accountType_enum" AS ENUM('free', 'paid');
         END IF;
       END
       $$;`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "users" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "email" character varying NOT NULL,
         "firstName" character varying(100) NOT NULL DEFAULT '',
         "lastName" character varying(100) NOT NULL DEFAULT '',
         "passwordHash" character varying NOT NULL,
         "emailConfirmed" boolean NOT NULL DEFAULT false,
         "calibrationProfileName" character varying(255),
         "calibrationWeights" jsonb,
         "roleTitle" character varying(150),
         "company" character varying(150),
         "linkedinUrl" character varying(255),
         "intendedUse" character varying(255),
         "lastAssessmentId" uuid,
         "profileCompletedAt" TIMESTAMP WITH TIME ZONE,
         "role" character varying(50) NOT NULL DEFAULT 'user',
         "subscriptionTier" "users_subscriptionTier_enum" NOT NULL DEFAULT 'FREE',
         "accountType" "users_accountType_enum" NOT NULL DEFAULT 'free',
         "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_users_email" UNIQUE ("email")
       )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calibrationProfileName" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calibrationWeights" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$
       BEGIN
         IF to_regclass('public.users') IS NOT NULL THEN
           EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "calibrationWeights"';
           EXECUTE 'ALTER TABLE "users" DROP COLUMN IF EXISTS "calibrationProfileName"';
         END IF;
       END
       $$;`,
    );
  }
}
