import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductSignalSnapshotReview2360000000000 implements MigrationInterface {
  name = 'ProductSignalSnapshotReview2360000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."product_signal_snapshots_review_status_enum" AS ENUM('open', 'monitoring', 'resolved')`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_signal_snapshots" ADD COLUMN IF NOT EXISTS "review_status" "public"."product_signal_snapshots_review_status_enum" NOT NULL DEFAULT 'open'`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_signal_snapshots" ADD COLUMN IF NOT EXISTS "review_note" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_signal_snapshots" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_signal_snapshots" DROP COLUMN IF EXISTS "reviewed_at"`);
    await queryRunner.query(`ALTER TABLE "product_signal_snapshots" DROP COLUMN IF EXISTS "review_note"`);
    await queryRunner.query(`ALTER TABLE "product_signal_snapshots" DROP COLUMN IF EXISTS "review_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."product_signal_snapshots_review_status_enum"`);
  }
}
