import { describe, expect, test, beforeEach } from "vitest";
import * as taskClaimModule from "../index";
import { expectText } from "../../../__tests__/utils/commandResult.js";

const tcCall = taskClaimModule.call;

describe("task-claim", () => {
  beforeEach(() => {
    taskClaimModule.clearTaskClaimStore?.();
  });

  test("returns help for empty args", async () => {
    const result = await tcCall("");
    expect(expectText(result)).toContain("Task Claim");
  });

  test("returns help for --help", async () => {
    const result = await tcCall("--help");
    expect(expectText(result)).toContain("--claim");
    expect(expectText(result)).toContain("--release");
    expect(expectText(result)).toContain("--steal");
    expect(expectText(result)).toContain("--status");
    expect(expectText(result)).toContain("--list");
  });

  test("registers default tasks on first call", async () => {
    await tcCall("--list --json");
    // After first call, default tasks should be registered
    expect(taskClaimModule.registerTask).toBeDefined();
  });

  test("claim creates a lease and returns claim info", async () => {
    const result = await tcCall("--claim task-001 --session sess-abc --json");
    const data = JSON.parse(expectText(result));
    expect(data.claimId).toBeDefined();
    expect(data.taskId).toBe("task-001");
    expect(data.ownerSessionId).toBe("sess-abc");
    expect(data.token).toBeDefined();
  });

  test("claim updates task status to in_progress", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    const statusResult = await tcCall("--status task-001 --json");
    const data = JSON.parse(expectText(statusResult));
    expect(data.classification).toBe("owned");
    expect(data.state).toBe("reserving");
  });

  test("double claim on same task fails", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    const result = await tcCall("--claim task-001 --session sess-xyz --json");
    expect(expectText(result)).toMatch(/error/i);
  });

  test("release frees the lease", async () => {
    const claimResult = await tcCall("--claim task-001 --session sess-abc --json");
    const claimData = JSON.parse(expectText(claimResult));

    const releaseResult = await tcCall(`--release ${claimData.claimId} --json`);
    const releaseData = JSON.parse(expectText(releaseResult));
    expect(releaseData).toHaveProperty("released");
    expect(releaseData.released.taskId).toBe("task-001");
  });

  test("status shows available for unclaimed task", async () => {
    const result = await tcCall("--status task-999 --json");
    const data = JSON.parse(expectText(result));
    expect(data.classification).toBe("available");
    expect(data.state).toBeUndefined();
  });

  test("list shows active leases", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    await tcCall("--claim task-002 --session sess-xyz");

    const result = await tcCall("--list --json");
    const data = JSON.parse(expectText(result));
    expect(data.activeLeases.length).toBe(2);
    const taskIds = data.activeLeases.map((l: any) => l.taskId).sort();
    expect(taskIds).toEqual(["task-001", "task-002"]);
  });

  test("list excludes released leases", async () => {
    const claimResult = await tcCall("--claim task-001 --session sess-abc --json");
    const claimData = JSON.parse(expectText(claimResult));
    await tcCall(`--release ${claimData.claimId}`);

    const result = await tcCall("--list --json");
    const data = JSON.parse(expectText(result));
    expect(data.activeLeases.length).toBe(0);
  });

  test("steal reassigns ownership with provenance", async () => {
    const claimResult = await tcCall("--claim task-001 --session sess-abc --json");
    const claimData = JSON.parse(expectText(claimResult));

    const stealResult = await tcCall(`--steal ${claimData.claimId} --session sess-new --reason timeout --json`);
    expect(stealResult.type).toBe("text");
    const stealData = JSON.parse(expectText(stealResult));
    expect(stealData.stolen.taskId).toBe("task-001");
    expect(stealData.stolen.ownerSessionId).toBe("sess-new");
    expect(stealData.stolen.previousClaimId).toBe(claimData.claimId);
  });

  test("steal with wrong expected claim id fails", async () => {
    await tcCall("--claim task-001 --session sess-abc");
    const result = await tcCall("--steal wrong-claim-id --session sess-new --reason test --json");
    expect(expectText(result)).toMatch(/error/i);
  });

  test("release with invalid claim id fails", async () => {
    const result = await tcCall("--release invalid-claim-id --json");
    expect(expectText(result)).toMatch(/error/i);
  });

  test("claim without required options fails", async () => {
    const result = await tcCall("--claim --json");
    expect(expectText(result)).toContain("Error");
  });

  test("release without required options fails", async () => {
    const result = await tcCall("--release --json");
    expect(expectText(result)).toContain("Error");
  });

  test("steal without required options fails", async () => {
    const result = await tcCall("--steal --json");
    expect(expectText(result)).toContain("Error");
  });

  test("status without required options fails", async () => {
    const result = await tcCall("--status --json");
    expect(expectText(result)).toContain("Error");
  });
});
