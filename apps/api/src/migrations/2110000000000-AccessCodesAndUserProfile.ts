import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessCodesAndUserProfile2110000000000
  implements MigrationInterface
{
  name = 'AccessCodesAndUserProfile2110000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "betaAccessApproved"`);

    await queryRunner.query(`ALTER TABLE "beta_access_codes" RENAME TO "access_codes"`);

    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "PK_beta_access_codes_id" TO "PK_access_codes_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "UQ_beta_access_codes_codeHash" TO "UQ_access_codes_codeHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_createdBy" TO "FK_access_codes_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_assigned" TO "FK_access_codes_assigned"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_redeemedBy" TO "FK_access_codes_redeemedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_beta_access_codes_revokedBy" TO "FK_access_codes_revokedBy"`,
    );

    await queryRunner.query(
      `ALTER INDEX "IDX_beta_access_codes_assignedUserId" RENAME TO "IDX_access_codes_assignedUserId"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_beta_access_codes_redeemedAt" RENAME TO "IDX_access_codes_redeemedAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_beta_access_codes_revokedAt" RENAME TO "IDX_access_codes_revokedAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_beta_access_codes_createdAt" RENAME TO "IDX_access_codes_createdAt"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD "roleTitle" character varying(150)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "company" character varying(150)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "linkedinUrl" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "intendedUse" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "profileCompletedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "profileCompletedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "intendedUse"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "linkedinUrl"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "company"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "roleTitle"`);

    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_createdAt" RENAME TO "IDX_beta_access_codes_createdAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_revokedAt" RENAME TO "IDX_beta_access_codes_revokedAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_redeemedAt" RENAME TO "IDX_beta_access_codes_redeemedAt"`,
    );
    await queryRunner.query(
      `ALTER INDEX "IDX_access_codes_assignedUserId" RENAME TO "IDX_beta_access_codes_assignedUserId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_revokedBy" TO "FK_beta_access_codes_revokedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_redeemedBy" TO "FK_beta_access_codes_redeemedBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_assigned" TO "FK_beta_access_codes_assigned"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "FK_access_codes_createdBy" TO "FK_beta_access_codes_createdBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "UQ_access_codes_codeHash" TO "UQ_beta_access_codes_codeHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "access_codes" RENAME CONSTRAINT "PK_access_codes_id" TO "PK_beta_access_codes_id"`,
    );

    await queryRunner.query(`ALTER TABLE "access_codes" RENAME TO "beta_access_codes"`);

    await queryRunner.query(
      `ALTER TABLE "users" ADD "betaAccessApproved" boolean NOT NULL DEFAULT false`,
    );
  }
}
