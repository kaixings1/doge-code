import { describe, expect, test, beforeEach } from "vitest";
import * as specWorkflowModule from "../index";
import { expectText } from "../../../__tests__/utils/commandResult.js";

const swCall = specWorkflowModule.call;

describe("spec-workflow", () => {
  beforeEach(() => {
    // 每个测试前重置内存存储
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = specWorkflowModule as any;
    if (mod.resetSpecWorkflowStore) {
      mod.resetSpecWorkflowStore();
    }
  });

  test("returns help for empty args", async () => {
    const result = await swCall("");
    expect(expectText(result)).toContain("Spec Workflow");
    expect(expectText(result)).toContain("guide");
  });

  test("returns help for --help", async () => {
    const result = await swCall("--help");
    expect(expectText(result)).toContain("approvals");
    expect(expectText(result)).toContain("status");
  });

  test("guide returns workflow guide text", async () => {
    const result = await swCall("guide");
    expect(expectText(result)).toContain("Requirements");
    expect(expectText(result)).toContain("Design");
    expect(expectText(result)).toContain("Tasks");
    expect(expectText(result)).toContain("Implementation");
  });

  test("guide with --json returns JSON", async () => {
    const result = await swCall("guide --json");
    const data = JSON.parse(expectText(result));
    expect(data.type).toBe("spec-workflow-guide");
    expect(data.guide).toContain("Requirements");
  });

  test("steering returns steering guide", async () => {
    const result = await swCall("steering");
    expect(expectText(result)).toContain("product.md");
    expect(expectText(result)).toContain("tech.md");
  });

  test("status creates spec and returns not-started", async () => {
    const result = await swCall("status my-spec --json");
    const data = JSON.parse(expectText(result));
    expect(data.name).toBe("my-spec");
    expect(data.overallStatus).toBe("requirements-needed");
    expect(data.phases.length).toBe(4);
  });

  test("status returns error without spec name", async () => {
    const result = await swCall("status");
    expect(expectText(result)).toContain("Error");
    expect(expectText(result)).toContain("requires a spec name");
  });

  test("approvals request creates approval", async () => {
    const result = await swCall('approvals request --title "My Spec" --file specs/xxx/requirements.md --json');
    const data = JSON.parse(expectText(result));
    expect(data.success).toBe(true);
    expect(data.approval.title).toBe("My Spec");
    expect(data.approval.status).toBe("pending");
    expect(data.approval.id).toBeDefined();
  });

  test("approvals request without required params fails", async () => {
    const result = await swCall("approvals request --json");
    expect(expectText(result)).toContain("Error");
    expect(expectText(result)).toContain("requires --title and --file");
  });

  test("approvals status lists all approvals", async () => {
    const a1 = await swCall('approvals request --title "A" --file a.md --json');
    JSON.parse(expectText(a1))
    const a2 = await swCall('approvals request --title "B" --file b.md --json');
    JSON.parse(expectText(a2))

    const result = await swCall("approvals status --json");
    const data = JSON.parse(expectText(result));
    expect(data.approvals.length).toBeGreaterThanOrEqual(2);
  });

  test("approvals status with id returns specific approval", async () => {
    const createResult = await swCall('approvals request --title "Test" --file test.md --json');
    const createData = JSON.parse(expectText(createResult));
    const approvalId = createData.approval.id;

    const result = await swCall(`approvals status --id ${approvalId} --json`);
    const data = JSON.parse(expectText(result));
    expect(data.id).toBe(approvalId);
    expect(data.title).toBe("Test");
  });

  test("approvals delete removes approval", async () => {
    const createResult = await swCall('approvals request --title "Delete Me" --file del.md --json');
    const createData = JSON.parse(expectText(createResult));
    const approvalId = createData.approval.id;

    const result = await swCall(`approvals delete --id ${approvalId} --json`);
    const data = JSON.parse(expectText(result));
    expect(data.success).toBe(true);
    expect(data.deleted).toBe(approvalId);

    // 确认已删除
    const statusResult = await swCall(`approvals status --id ${approvalId}`);
    expect(expectText(statusResult)).toContain("not found");
  });

  test("log records implementation", async () => {
    const result = await swCall('log task-001 --task "Implement login" --type feature --json');
    const data = JSON.parse(expectText(result));
    expect(data.success).toBe(true);
    expect(data.log.taskId).toBe("task-001");
    expect(data.log.task).toBe("Implement login");
    expect(data.log.type).toBe("feature");
  });

  test("log without task id fails", async () => {
    // "log" 没有 taskId 参数 — 应该报错
    const result = await swCall("log --json");
    expect(expectText(result)).toContain("Error");
    expect(expectText(result)).toContain("requires a task ID");
  });

  test("status shows phases progression", async () => {
    // 创建规格
    await swCall("status feature-x");

    // 添加 requirements 阶段
    // (直接操作内存模拟)
    // 由于无法直接操作内部状态，测试基本流程
    const result = await swCall("status feature-x --json");
    const data = JSON.parse(expectText(result));
    expect(data.phases[0].name).toBe("Requirements");
    expect(data.phases[0].status).toBe("missing");
  });

  test("guide is text by default", async () => {
    const result = await swCall("guide");
    expect(expectText(result)).not.toContain("JSON");
    expect(expectText(result)).toContain("Requirements → Design → Tasks → Implementation");
  });

  test("steering with --json returns JSON", async () => {
    const result = await swCall("steering --json");
    const data = JSON.parse(expectText(result));
    expect(data.type).toBe("steering-guide");
    expect(data.guide).toContain("product.md");
  });
});
