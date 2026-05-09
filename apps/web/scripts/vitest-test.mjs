import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const passthrough = process.argv.slice(2).filter((arg) => arg !== "--runInBand");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const vitestConfigPath = path.join(repoRoot, "vitest.config.ts");
const cmd = [
  "npm",
  "exec",
  "--",
  "vitest",
  "run",
  "--config",
  JSON.stringify(vitestConfigPath),
  ...passthrough.map((arg) => JSON.stringify(arg)),
].join(" ");

const result = spawnSync(cmd, { stdio: "inherit", cwd: repoRoot, shell: true });

if (result.error) {
  console.error("vitest-test spawn error:", result.error);
}

process.exit(result.status ?? 1);
