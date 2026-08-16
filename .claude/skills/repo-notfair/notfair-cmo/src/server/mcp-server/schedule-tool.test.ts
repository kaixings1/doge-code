import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "notfair-schedule-tool-"));
  process.env.NOTFAIR_CMO_DATA_DIR = dataDir;
  // Force a fresh DB connection for each test so projects.slug uniqueness
  // doesn't carry across.
  vi.resetModules();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.NOTFAIR_CMO_DATA_DIR;
});

async function seedProjectAndAgent(slug: string, agentId: string) {
  const { getDb } = await import("@/server/db/db");
  const db = getDb();
  db.prepare(
    "INSERT INTO projects (id, slug, display_name, created_at, harness_adapter) VALUES (?, ?, ?, ?, 'claude-code-local')",
  ).run(randomUUID(), slug, slug, new Date().toISOString());

  // listProjectAgents reads from notfair-meta.json sidecars; the simplest
  // way to make it return the agent is to write the sidecar.
  const { writeAgentMeta } = await import("@/server/agent-meta");
  await writeAgentMeta({
    agent_id: agentId,
    project_slug: slug,
    name: "Ana",
    template_key: "google_ads",
    created_at: new Date().toISOString(),
  });
}

describe("schedule_recurring_work MCP tool", () => {
  it("creates a scheduled_jobs row visible in the cron view", async () => {
    await seedProjectAndAgent("demo1", "demo1-google-ads-ana");
    const { findTool } = await import("./tools");
    const tool = findTool("schedule_recurring_work");
    expect(tool).toBeDefined();

    const result = await tool!.handler({
      project_slug: "demo1",
      agent_id: "demo1-google-ads-ana",
      name: "daily-anomaly-check",
      cron_expr: "0 16 * * *",
      message: "Run the daily anomaly check and report any spikes.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Verify a row landed in scheduled_jobs.
    const { listProjectScheduledJobs } = await import("@/server/scheduler");
    const jobs = listProjectScheduledJobs("demo1");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      project_slug: "demo1",
      agent_id: "demo1-google-ads-ana",
      name: "daily-anomaly-check",
      cron_expr: "0 16 * * *",
      enabled: 1,
    });
    expect(jobs[0].next_run_at).toBeTruthy();
  });

  it("rejects invalid cron expressions", async () => {
    await seedProjectAndAgent("demo1", "demo1-google-ads-ana");
    const { findTool } = await import("./tools");
    const tool = findTool("schedule_recurring_work")!;
    const result = await tool.handler({
      project_slug: "demo1",
      agent_id: "demo1-google-ads-ana",
      name: "bad",
      cron_expr: "not a cron",
      message: "...",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Invalid cron_expr/);
    }
  });

  it("rejects an agent that doesn't belong to the project", async () => {
    await seedProjectAndAgent("demo1", "demo1-google-ads-ana");
    const { findTool } = await import("./tools");
    const tool = findTool("schedule_recurring_work")!;
    const result = await tool.handler({
      project_slug: "demo1",
      agent_id: "other-project-agent",
      name: "x",
      cron_expr: "0 9 * * *",
      message: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not part of project/);
    }
  });

  it("rejects bad name shapes (must be kebab-case lowercase)", async () => {
    await seedProjectAndAgent("demo1", "demo1-google-ads-ana");
    const { findTool } = await import("./tools");
    const tool = findTool("schedule_recurring_work")!;
    const result = await tool.handler({
      project_slug: "demo1",
      agent_id: "demo1-google-ads-ana",
      name: "Bad Name With Spaces",
      cron_expr: "0 9 * * *",
      message: "x",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate (project, agent, name)", async () => {
    await seedProjectAndAgent("demo1", "demo1-google-ads-ana");
    const { findTool } = await import("./tools");
    const tool = findTool("schedule_recurring_work")!;
    const args = {
      project_slug: "demo1",
      agent_id: "demo1-google-ads-ana",
      name: "weekly-review",
      cron_expr: "0 16 * * 1",
      message: "Run the review.",
    };
    const first = await tool.handler(args);
    expect(first.ok).toBe(true);
    const second = await tool.handler(args);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatch(/already exists/);
    }
  });
});
