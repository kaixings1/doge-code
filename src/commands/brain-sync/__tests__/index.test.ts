import { describe, expect, test, beforeEach } from "vitest";
import * as brainSyncModule from "../index";

const bsCall = brainSyncModule.call;

describe("brain-sync", () => {
  beforeEach(() => {
    brainSyncModule.clearBrainStore?.();
  });

  test("returns help for empty args", async () => {
    const result = await bsCall("");
    expect(result.type).toBe("text");
    expect(result.value).toContain("Brain Sync");
  });

  test("returns help for --help", async () => {
    const result = await bsCall("--help");
    expect(result.type).toBe("text");
    expect(result.value).toContain("--status");
    expect(result.value).toContain("--sync");
  });

  test("status shows no groups when store is empty", async () => {
    const result = await bsCall("--status --json");
    const data = JSON.parse(result.value);
    expect(data.mode).toBe("status");
    expect(data.groups.length).toBe(0);
    expect(data.items.length).toBe(0);
  });

  test("status shows registered groups and entries", async () => {
    brainSyncModule.registerBrainGroup?.({
      id: "g1",
      scope: "architecture",
      lifecycle: "always-sync",
      sourcePaths: ["docs/architecture.md"],
      brainSubdir: "architecture",
    });
    brainSyncModule.registerBrainEntry?.({
      id: "e1",
      sourcePath: "README.md",
      brainPath: "brain/references/README.md",
      syncEnabled: true,
      syncDirection: "repo-to-brain",
    });

    const result = await bsCall("--status --json");
    const data = JSON.parse(result.value);
    expect(data.groups.length).toBe(1);
    expect(data.groups[0].id).toBe("g1");
    expect(data.items.length).toBeGreaterThanOrEqual(1);
  });

  test("sync with --dry-run previews operations", async () => {
    brainSyncModule.registerBrainGroup?.({
      id: "g1",
      lifecycle: "always-sync",
      sourcePaths: ["docs/architecture.md"],
      brainSubdir: "references",
    });

    const result = await bsCall("--sync --dry-run --json");
    const data = JSON.parse(result.value);
    expect(data.mode).toBe("sync");
    expect(data.dryRun).toBe(true);
    expect(data.skippedCount).toBeGreaterThanOrEqual(1);
  });

  test("sync without --dry-run marks items as synced", async () => {
    brainSyncModule.registerBrainGroup?.({
      id: "g1",
      lifecycle: "always-sync",
      sourcePaths: ["docs/architecture.md"],
      brainSubdir: "references",
    });

    const result = await bsCall("--sync --json");
    const data = JSON.parse(result.value);
    expect(data.mode).toBe("sync");
    expect(data.dryRun).toBe(false);
    expect(data.syncedCount).toBeGreaterThanOrEqual(1);
  });

  test("scope filters groups and entries", async () => {
    brainSyncModule.registerBrainGroup?.({
      id: "g1",
      scope: "architecture",
      lifecycle: "always-sync",
      sourcePaths: ["docs/architecture.md"],
    });
    brainSyncModule.registerBrainGroup?.({
      id: "g2",
      scope: "decisions",
      lifecycle: "always-sync",
      sourcePaths: ["docs/decisions.md"],
    });

    const result = await bsCall("--status --scope architecture --json");
    const data = JSON.parse(result.value);
    expect(data.groups.length).toBe(1);
    expect(data.groups[0].id).toBe("g1");
  });

  test("never-sync lifecycle excludes group", async () => {
    brainSyncModule.registerBrainGroup?.({
      id: "g1",
      lifecycle: "never-sync",
      sourcePaths: ["docs/secret.md"],
    });

    const result = await bsCall("--status --json");
    const data = JSON.parse(result.value);
    expect(data.groups.length).toBe(0);
  });

  test("archive-only lifecycle is skipped in status mode", async () => {
    brainSyncModule.registerBrainGroup?.({
      id: "g1",
      lifecycle: "archive-only",
      sourcePaths: ["docs/archive.md"],
    });

    const result = await bsCall("--status --json");
    const data = JSON.parse(result.value);
    expect(data.groups.length).toBe(0);
  });

  test("entries with syncEnabled=false are excluded", async () => {
    brainSyncModule.registerBrainEntry?.({
      id: "e1",
      sourcePath: "README.md",
      brainPath: "brain/references/README.md",
      syncEnabled: false,
      syncDirection: "repo-to-brain",
    });

    const result = await bsCall("--status --json");
    const data = JSON.parse(result.value);
    expect(data.items.length).toBe(0);
  });

  test("entries with non-repo-to-brain direction are excluded", async () => {
    brainSyncModule.registerBrainEntry?.({
      id: "e1",
      sourcePath: "README.md",
      brainPath: "brain/references/README.md",
      syncEnabled: true,
      syncDirection: "brain-to-repo",
    });

    const result = await bsCall("--status --json");
    const data = JSON.parse(result.value);
    expect(data.items.length).toBe(0);
  });
});
