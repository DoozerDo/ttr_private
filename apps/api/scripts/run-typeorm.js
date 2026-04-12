const { spawnSync } = require('child_process');
const { loadEnv } = require('./load-env');

loadEnv();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-typeorm.js <typeorm args...>');
  process.exit(1);
}

const typeormCliPath = require.resolve('typeorm/cli');
const result = spawnSync(process.execPath, [typeormCliPath, ...args], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  throw result.error;
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
