const fs = require('fs');
const path = require('path');

const migrationPathCandidates = [
  path.join(__dirname, '..', 'dist', 'migrations', '2170000000000-PgvectorEmbeddings.js'),
  path.join(__dirname, '..', 'dist', 'apps', 'api', 'src', 'migrations', '2170000000000-PgvectorEmbeddings.js'),
];
const migrationPath = migrationPathCandidates.find((candidate) => fs.existsSync(candidate));
const unsafeSql = 'CREATE EXTENSION IF NOT EXISTS vector';

if (!migrationPath) {
  console.error(
    `[assert-safe-migrations] Missing compiled migration: ${migrationPathCandidates.join(' | ')}`,
  );
  process.exit(1);
}

const content = fs.readFileSync(migrationPath, 'utf8');

if (content.includes(unsafeSql)) {
  console.error(
    `[assert-safe-migrations] Unsafe SQL detected in compiled migration: ${migrationPath}`,
  );
  console.error(`[assert-safe-migrations] Found substring: "${unsafeSql}"`);
  process.exit(1);
}

console.log(
  `[assert-safe-migrations] OK: compiled migration is safe (${migrationPath})`,
);
