import fs from 'fs';
import path from 'path';

describe('bootstrap order', () => {
  it('runs migrations before schema compatibility gate', () => {
    const mainPath = path.resolve(__dirname, '..', 'main.ts');
    const content = fs.readFileSync(mainPath, 'utf8');

    const migrationsIndex = content.indexOf('await dataSource.runMigrations()');
    const schemaGateIndex = content.indexOf(
      'await assertUsersBetaAccessApprovedColumnCompatible',
    );

    expect(migrationsIndex).toBeGreaterThan(0);
    expect(schemaGateIndex).toBeGreaterThan(0);
    expect(migrationsIndex).toBeLessThan(schemaGateIndex);
  });
});
