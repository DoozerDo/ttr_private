import { ApplicationAnalysisLink2410000000000 } from '../migrations/2410000000000-ApplicationAnalysisLink';
import { ApplicationResumeMetadata2420000000000 } from '../migrations/2420000000000-ApplicationResumeMetadata';

describe('ApplicationAnalysisLink schema alignment', () => {
  it('migration adds the analysisId column used by resume generation', async () => {
    const migration = new ApplicationAnalysisLink2410000000000();
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as any;

    await migration.up(queryRunner);

    const sql = queries.join('\n').toLowerCase();
    expect(sql).toContain('"analysisid" uuid');
    expect(sql).toContain('idx_applications_analysisid');
  });

  it('migration adds the resume metadata columns used during resume generation', async () => {
    const migration = new ApplicationResumeMetadata2420000000000();
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as any;

    await migration.up(queryRunner);

    const sql = queries.join('\n').toLowerCase();
    expect(sql).toContain('"verificationcoveragesnapshot" jsonb');
    expect(sql).toContain('"outcomelinkagesnapshot" jsonb');
  });
});
