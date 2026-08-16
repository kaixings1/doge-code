import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Separate config for prompt evals. Lives under tests/evals/*.eval.ts so the
 * default `pnpm test` (which globs src/**\/*.test.ts) doesn't trigger them.
 * Run via `pnpm eval`. Skips entirely when OPENAI_API_KEY is absent — the
 * user opted out of live evals during the design review (D24).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/evals/**/*.eval.ts"],
    testTimeout: 60_000,
  },
});
