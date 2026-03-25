import { BugReportsTable2330000000000 } from '../migrations/2330000000000-BugReportsTable';

describe('BugReports schema alignment', () => {
  it('migration includes all required bug_reports columns from entity contract', async () => {
    const migration = new BugReportsTable2330000000000();
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as any;

    await migration.up(queryRunner);
    const sql = queries.join('\n').toLowerCase();

    const expectedColumns = [
      'user_id',
      'reporter_email',
      'what_happened',
      'attempted_action',
      'expected_behavior',
      'route',
      'page_label',
      'app_version',
      'git_sha',
      'baseline_id',
      'assessment_id',
      'fit_score',
      'browser_info',
      'viewport',
      'runtime_context',
      'screenshot_storage_path',
      'screenshot_original_filename',
      'screenshot_mime_type',
      'screenshot_size_bytes',
      'status',
      'severity',
      'triage_notes',
      'resolved_at',
      'resolved_by_user_id',
      'created_at',
      'updated_at',
    ];

    for (const column of expectedColumns) {
      expect(sql).toContain(`"${column}"`);
    }
  });
});
