import { CoverLetters1790000000000 } from '../migrations/1790000000000-CoverLetters';

describe('CoverLetters migration safety', () => {
  it('is idempotent for existing cover_letters table and indexes', async () => {
    const migration = new CoverLetters1790000000000();
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as any;

    await migration.up(queryRunner);

    const sql = queries.join('\n').toLowerCase();
    expect(sql).toContain('create table if not exists "cover_letters"');
    expect(sql).toContain('create index if not exists "idx_cover_letters_userid"');
    expect(sql).toContain('create index if not exists "idx_cover_letters_jobid"');
    expect(sql).toContain(
      'create index if not exists "idx_cover_letters_baselineid"',
    );
    expect(sql).toContain(
      'create index if not exists "idx_cover_letters_createdat"',
    );
  });
});

