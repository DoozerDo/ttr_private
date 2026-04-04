#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const env = {
  ...process.env,
  BROWSERSLIST_IGNORE_OLD_DATA:
    process.env.BROWSERSLIST_IGNORE_OLD_DATA ?? "1",
  BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA:
    process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ?? "1",
  TTR_SILENCE_BASELINE_BROWSER_MAPPING_WARNING:
    process.env.TTR_SILENCE_BASELINE_BROWSER_MAPPING_WARNING ?? "1",
};

const result = spawnSync("next", ["build"], {
  env,
  shell: true,
  stdio: "inherit",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
