const { spawn } = require('child_process');
const path = require('path');

require('./load-env');

const cliPath = require.resolve('typeorm/cli.js', {
  paths: [path.resolve(__dirname, '..')],
});

const args = process.argv.slice(2);
const result = spawn(process.execPath, [cliPath, ...args], {
  stdio: 'inherit',
});

result.on('exit', (code) => {
  process.exit(code);
});
