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

const requiredMigrations = [
  '2100000000000-BetaAccessCodes.js',
  '2110000000000-AccessCodesAndUserProfile.js',
  '2450000000000-BetaAccessApprovedRepair.js',
];

const requiredFound = requiredMigrations.filter((filename) =>
  [
    path.join(__dirname, '..', 'dist', 'migrations', filename),
    path.join(__dirname, '..', 'dist', 'apps', 'api', 'src', 'migrations', filename),
  ].some((candidate) => fs.existsSync(candidate)),
);

const missing = requiredMigrations.filter((filename) => !requiredFound.includes(filename));
if (missing.length) {
  console.error(
    `[assert-safe-migrations] Missing required compiled migration(s): ${missing.join(', ')}`,
  );
  process.exit(1);
}

console.log(
  `[assert-safe-migrations] OK: required compiled migrations present (${requiredFound.join(', ')})`,
);
