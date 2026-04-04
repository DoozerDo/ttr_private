import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSearchSets2026000000000 implements MigrationInterface {
  name = 'DropSearchSets2026000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "search_set_runs" DROP CONSTRAINT IF EXISTS "FK_search_set_runs_baseline_versions"',
    );
    await queryRunner.query(
      'ALTER TABLE "search_set_runs" DROP CONSTRAINT IF EXISTS "FK_search_set_runs_search_sets"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_search_set_runs_baselineVersionId"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_search_set_runs_searchSetId"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "search_set_runs"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_sets_isActive"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_search_sets_userId"');
    await queryRunner.query('DROP TABLE IF EXISTS "search_sets"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "search_sets_source_type_enum"',
    );
    await queryRunner.query('DROP TYPE IF EXISTS "search_sets_workmode_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "search_sets_seniority_enum"');
  }

  public down(_queryRunner: QueryRunner): Promise<void> {
    // Search Sets are intentionally removed from the Beta scope (see docs/spec_beta_v1.md Section 7).
    void _queryRunner;
    return Promise.resolve();
  }
}
