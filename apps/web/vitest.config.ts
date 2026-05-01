import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.tsx",
    include: ["tests/**/*.test.*"],
  },
  resolve: {
    alias: [
      // Use an explicit `@/` prefix alias so Vite reliably resolves imports like `@/app/(app)/...`
      // on all platforms (route groups include parentheses).
      { find: "@/", replacement: `${path.resolve(__dirname, ".")}/` },
      { find: "@", replacement: path.resolve(__dirname, ".") },
      { find: "@shared", replacement: path.resolve(__dirname, "../../packages/shared") },
    ],
  },
});
