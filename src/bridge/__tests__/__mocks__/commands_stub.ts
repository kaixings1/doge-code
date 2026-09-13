// Mock for all src/commands/*/index.ts(x) files
// This file is aliased by vitest.config.ts for all command module imports
export default {
  type: "prompt" as const,
  name: "stub",
  description: "stub command (mocked for tests)",
}
