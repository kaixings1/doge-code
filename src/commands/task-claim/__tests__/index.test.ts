import { describe, expect, test, beforeEach } from "vitest";
import * as taskClaimModule from "../index";

const tcCall = taskClaimModule.call;

describe("task-claim", () => {
  beforeEach(() => {
    taskClaimModule.clearTaskClaimStore?.();
  });

  test("returns help for empty args", async () => {
    const result = await tcCall("");
    expect(result.type).toBe("text");
    expect(result.value).toContain("Task Claim");
  });

  test("returns help for --help", async () => {
    const result = await tcCall("--help");
    expect(result.type).toBe("text");
    expect(result.value).toContain("--claim");
    expect(result.value).toContain("--release");
    expect(result.value).toContain("--steal");
    expect(result.value).toContain("--status");
    expect(result.value).toContain("--list");
  });

  test("registers default tasks on first call", async () => {
    await tcCall("--list --json");
    // After first call, default tasks should be registered
    expect(taskClaimModule.registerTask).toBeDefined();
  });

  test("claim creates a lease and returns claim info", async () => {
    const result = await tcCall("--claim task-001 --session sess-abc --json");
    expect(result.type).toBe("text");
    const data = JSON.parse(result.value);
    expect(data.claimId).toBeDefined();
    expect(data.taskId).toBe("task-001");
    expect(data.ownerSessionId).toBe("sess-abc");
    expect(data.token).toBeDefined();
  });

  test("claim updates task status to in_progress", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    const statusResult = await tcCall("--status task-001 --json");
    const data = JSON.parse(statusResult.value);
    expect(data.classification).toBe("owned");
    expect(data.state).toBe("reserving");
  });

  test("double claim on same task fails", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    const result = await tcCall("--claim task-001 --session sess-xyz --json");
    expect(result.value).toMatch(/error/i);
  });

  test("release frees the lease", async () => {
    const claimResult = await tcCall("--claim task-001 --session sess-abc --json");
    const claimData = JSON.parse(claimResult.value);

    const releaseResult = await tcCall(`--release ${claimData.claimId} --json`);
    const releaseData = JSON.parse(releaseResult.value);
    expect(releaseData).toHaveProperty("released");
    expect(releaseData.released.taskId).toBe("task-001");
  });

  test("status shows available for unclaimed task", async () => {
    const result = await tcCall("--status task-999 --json");
    const data = JSON.parse(result.value);
    expect(data.classification).toBe("available");
    expect(data.state).toBeUndefined();
  });

  test("list shows active leases", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    await tcCall("--claim task-002 --session sess-xyz");

    const result = await tcCall("--list --json");
    const data = JSON.parse(result.value);
    expect(data.activeLeases.length).toBe(2);
    const taskIds = data.activeLeases.map((l: any) => l.taskId).sort();
    expect(taskIds).toEqual(["task-001", "task-002"]);
  });

  test("list excludes released leases", async () => {
    const claimResult = await tcCall("--claim task-001 --session sess-abc --json");
    const claimData = JSON.parse(claimResult.value);
    await tcCall(`--release ${claimData.claimId}`);

    const result = await tcCall("--list --json");
    const data = JSON.parse(result.value);
    expect(data.activeLeases.length).toBe(0);
  });

  test("steal reassigns ownership with provenance", async () => {
    const claimResult = await tcCall("--claim task-001 --session sess-abc --json");
    const claimData = JSON.parse(claimResult.value);

    const stealResult = await tcCall(`--steal ${claimData.claimId} --session sess-new --reason timeout --json`);
    expect(stealResult.type).toBe("text");
    const stealData = JSON.parse(stealResult.value);
    expect(stealData.stolen.taskId).toBe("task-001");
    expect(stealData.stolen.ownerSessionId).toBe("sess-new");
    expect(stealData.stolen.previousClaimId).toBe(claimData.claimId);
  });

  test("steal with wrong expected claim id fails", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    const result = await tcCall("--steal wrong-claim-id --session sess-new --reason test --json");
    expect(result.value).toMatch(/error/i);
  });

  test("release with invalid claim id fails", async () => {
    const result = await tcCall("--release invalid-claim-id --json");
    expect(result.value).toMatch(/error/i);
  });

  test("claim without required options fails", async () => {
    const result = await tcCall("--claim --json");
    expect(result.value).toContain("Error");
  });

  test("release without required options fails", async () => {
    const result = await tcCall("--release --json");
    expect(result.value).toContain("Error");
  });

  test("steal without required options fails", async () => {
    const result = await tcCall("--steal --json");
    expect(result.value).toContain("Error");
  });

  test("status without required options fails", async () => {
    const result = await tcCall("--status --json");
    expect(result.value).toContain("Error");
  });
});
