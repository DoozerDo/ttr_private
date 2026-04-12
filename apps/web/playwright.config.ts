import { defineConfig, devices } from "@playwright/test";
import { syntheticBaseURL } from "./tests/synthetic/synthetic-config";

const useWebServer = !process.env.BASE_URL;

export default defineConfig({
  testDir: "./tests/synthetic",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"]],
  use: {
    baseURL: syntheticBaseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: {
      width: 1440,
      height: 1200,
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: useWebServer
    ? {
        command: "npm run start -- --hostname 127.0.0.1 --port 3100",
        cwd: __dirname,
        url: syntheticBaseURL,
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          API_BASE_URL: process.env.API_BASE_URL || "http://127.0.0.1:3001",
          NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3001",
          SYNTHETIC_INGEST_TOKEN: process.env.SYNTHETIC_INGEST_TOKEN || "synthetic-ingest-local",
        },
        timeout: 120_000,
      }
    : undefined,
});
