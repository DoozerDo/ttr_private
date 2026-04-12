const fs = require('fs');
const path = require('path');

function parseEnvContent(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const equalsIndex = normalizedLine.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = normalizedLine.slice(0, equalsIndex).trim();
    if (!key) continue;

    let value = normalizedLine.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const values = parseEnvContent(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadEnv() {
  const cwd = process.cwd();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const candidates = [
    '.env',
    '.env.local',
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ];

  for (const relativePath of candidates) {
    loadEnvFile(path.join(cwd, relativePath));
  }
}

module.exports = { loadEnv };
