const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'beta-scope-config.json');
const SPEC_REF = 'docs/spec_beta_v1.md Section 7';
const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'apps/api/dist',
  'apps/web/.next',
]);

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (error) {
    console.error(`Failed to read beta scope config at ${CONFIG_PATH}:`, error);
    process.exit(1);
  }
}

function resolveTripwires(config) {
  const tripwires = Array.isArray(config.tripwires) ? config.tripwires : [];
  const patterns = tripwires
    .filter((entry) => typeof entry.value === 'string')
    .map((entry) => entry.value);
  const paths = Array.isArray(config.paths)
    ? config.paths.map((entry) => path.resolve(process.cwd(), entry))
    : [];
  const skipPaths = new Set(
    Array.isArray(config.skips)
      ? config.skips.map((entry) => path.resolve(process.cwd(), entry))
      : [],
  );
  const skipExtensions = Array.isArray(config.skipExtensions)
    ? new Set(config.skipExtensions)
    : new Set();
  return { patterns, paths, skipPaths, skipExtensions };
}

function shouldSkipDir(dir) {
  return SKIP_DIR_NAMES.has(path.basename(dir));
}

function isSkipped(entryPath, skipPaths) {
  for (const skipPath of skipPaths) {
    if (entryPath === skipPath || entryPath.startsWith(`${skipPath}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

async function scanFile(filePath, patterns, violations, skipPaths, skipExtensions) {
  if (isSkipped(filePath, skipPaths)) return;
  if (skipExtensions.has(path.extname(filePath))) return;
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      patterns.forEach((pattern) => {
        if (line.includes(pattern)) {
          violations.push({
            type: 'pattern',
            pattern,
            path: path.relative(process.cwd(), filePath),
            line: index + 1,
            column: line.indexOf(pattern) + 1,
          });
        }
      });
    });
  } catch (error) {
    // Skip binary or unreadable files
  }
}

async function scanDir(dir, patterns, violations, skipPaths, skipExtensions) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (isSkipped(entryPath, skipPaths)) continue;
    if (entry.isDirectory()) {
      if (shouldSkipDir(entryPath)) continue;
      await scanDir(entryPath, patterns, violations, skipPaths, skipExtensions);
    } else if (entry.isFile()) {
      await scanFile(entryPath, patterns, violations, skipPaths, skipExtensions);
    }
  }
}

function checkPathTripwires(paths) {
  const violations = [];
  paths.forEach((targetPath) => {
    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      violations.push({
        type: 'path',
        kind: stats.isDirectory() ? 'directory' : 'file',
        path: path.relative(process.cwd(), targetPath),
      });
    }
  });
  return violations;
}

async function runCheck() {
  const config = loadConfig();
  const { patterns, paths, skipPaths, skipExtensions } = resolveTripwires(config);
  const violations = [];

  await scanDir(process.cwd(), patterns, violations, skipPaths, skipExtensions);
  violations.push(...checkPathTripwires(paths));

  if (violations.length) {
    console.error(`\nBeta scope violation detected (per ${SPEC_REF}):`);
    violations.forEach((violation) => {
      if (violation.type === 'path') {
        console.error(
          `  - Forbidden ${violation.kind} found: ${violation.path}`,
        );
      } else {
        console.error(
          `  - Forbidden pattern "${violation.pattern}" found in ${violation.path}:${violation.line}:${violation.column}`,
        );
      }
    });
    process.exit(1);
  }

  console.log(`Beta scope check passed (per ${SPEC_REF}).`);
}

runCheck().catch((error) => {
  console.error('Beta scope check failed unexpectedly:', error);
  process.exit(1);
});
