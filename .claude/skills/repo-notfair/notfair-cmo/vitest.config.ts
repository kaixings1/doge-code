import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    // Default environment is `node`. Component / page tests that need a DOM
    // must add `// @vitest-environment jsdom` at the top of the file (vitest 4
    // removed `environmentMatchGlobs` in favor of per-file comments).
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/types/**",
        // Server-component pages: data-fetch + render. Better covered by E2E.
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        // shadcn UI primitives: thin wrappers around radix-ui. Testing them
        // tests radix-ui, not our code.
        "src/components/ui/**",
        // Prompt-template strings — covered by the eval harness, not unit tests.
        "src/server/agent-templates.ts",
        // Trivial DOM-resize hook — low value to unit-test in isolation.
        "src/hooks/use-mobile.ts",
      ],
    },
  },
});
