import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./apps/web/tests/setup.tsx",
    include: ["apps/web/tests/**/*.test.*"],
  },
  resolve: {
    alias: [
      // Match `apps/web/vitest.config.ts` so root-level `npx vitest ...` can resolve route-group paths.
      { find: "@/", replacement: `${path.resolve(__dirname, "apps/web")}/` },
      { find: "@", replacement: path.resolve(__dirname, "apps/web") },
      { find: "@shared", replacement: path.resolve(__dirname, "packages/shared") },
    ],
  },
});
