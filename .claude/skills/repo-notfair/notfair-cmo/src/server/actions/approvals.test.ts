import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

const getApprovalMock = vi.fn();
const resolveApprovalMock = vi.fn();
const requestApprovalRevisionMock = vi.fn();
const appendCommentMock = vi.fn();
const createPolicyMock = vi.fn();
const deletePolicyMock = vi.fn();
vi.mock("@/server/db/approvals", () => ({
  getApproval: (...a: unknown[]) => getApprovalMock(...a),
  resolveApproval: (...a: unknown[]) => resolveApprovalMock(...a),
  requestApprovalRevision: (...a: unknown[]) => requestApprovalRevisionMock(...a),
  appendComment: (...a: unknown[]) => appendCommentMock(...a),
  createPolicy: (...a: unknown[]) => createPolicyMock(...a),
  deletePolicy: (...a: unknown[]) => deletePolicyMock(...a),
}));

const wakeMock = vi.fn();
vi.mock("@/server/orchestration/approval-wakeup", () => ({
  wakeTaskOnApprovalResolution: (...a: unknown[]) => wakeMock(...a),
}));

import {
  addApprovalCommentAction,
  approveAction,
  createPolicyAction,
  deletePolicyAction,
  rejectAction,
  requestRevisionAction,
} from "./approvals";

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: "ap-1",
    project_slug: "demo",
    agent_id: "demo-cmo",
    task_id: null,
    action_summary: "raise bid",
    action_type: "bid_change",
    cost_estimate_usd: 0,
    reasoning: null,
    payload_json: "{}",
    status: "pending",
    decision_note: null,
    decided_by_kind: null,
    decided_by_id: null,
    created_at: "2026-05-01T00:00:00Z",
    resolved_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  wakeMock.mockResolvedValue(undefined);
});

describe("approveAction", () => {
  it("resolves approval, appends a user comment, and triggers wake-up", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "pending" }));
    resolveApprovalMock.mockReturnValue(makeApproval({ status: "approved" }));
    const out = await approveAction("ap-1", "looks good");
    expect(out).toEqual({ ok: true });
    expect(resolveApprovalMock).toHaveBeenCalledWith(
      "ap-1",
      "approved",
      expect.objectContaining({
        decision_note: "looks good",
        decided_by_kind: "user",
      }),
    );
    expect(appendCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        approval_id: "ap-1",
        author_kind: "user",
        body: "looks good",
      }),
    );
    expect(wakeMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("defaults comment body to 'Approved.' when no note given", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "pending" }));
    resolveApprovalMock.mockReturnValue(makeApproval({ status: "approved" }));
    await approveAction("ap-1");
    expect(appendCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Approved." }),
    );
  });

  it("returns ok:false when the approval is missing", async () => {
    getApprovalMock.mockReturnValue(null);
    const out = await approveAction("missing");
    expect(out).toEqual({ ok: false, error: "Approval not found." });
    expect(resolveApprovalMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when the approval is already resolved", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "approved" }));
    const out = await approveAction("ap-1");
    expect(out).toEqual({ ok: false, error: "Approval is already approved." });
    expect(resolveApprovalMock).not.toHaveBeenCalled();
  });
});

describe("rejectAction", () => {
  it("resolves approval to rejected with note and triggers wake-up", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "pending" }));
    resolveApprovalMock.mockReturnValue(makeApproval({ status: "rejected" }));
    const out = await rejectAction("ap-1", "too risky");
    expect(out).toEqual({ ok: true });
    expect(resolveApprovalMock).toHaveBeenCalledWith(
      "ap-1",
      "rejected",
      expect.objectContaining({
        decision_note: "too risky",
        decided_by_kind: "user",
      }),
    );
    expect(wakeMock).toHaveBeenCalled();
  });

  it("defaults comment body to 'Rejected.' when no note", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "pending" }));
    resolveApprovalMock.mockReturnValue(makeApproval({ status: "rejected" }));
    await rejectAction("ap-1");
    expect(appendCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Rejected." }),
    );
  });
});

describe("requestRevisionAction", () => {
  it("requires a non-empty note", async () => {
    const out = await requestRevisionAction("ap-1", "   ");
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/note is required/);
    expect(requestApprovalRevisionMock).not.toHaveBeenCalled();
  });

  it("transitions pending → revision_requested with the note", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "pending" }));
    requestApprovalRevisionMock.mockReturnValue(
      makeApproval({ status: "revision_requested" }),
    );
    const out = await requestRevisionAction("ap-1", "shrink scope");
    expect(out).toEqual({ ok: true });
    expect(requestApprovalRevisionMock).toHaveBeenCalledWith("ap-1", {
      decision_note: "shrink scope",
      decided_by_kind: "user",
    });
    expect(appendCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "shrink scope" }),
    );
    expect(wakeMock).toHaveBeenCalled();
  });

  it("refuses revision on a non-pending row", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "approved" }));
    const out = await requestRevisionAction("ap-1", "x");
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/pending/);
  });
});

describe("addApprovalCommentAction", () => {
  it("appends a user comment when the approval exists", async () => {
    getApprovalMock.mockReturnValue(makeApproval({ status: "approved" }));
    const out = await addApprovalCommentAction("ap-1", "fyi");
    expect(out.ok).toBe(true);
    expect(appendCommentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        approval_id: "ap-1",
        author_kind: "user",
        body: "fyi",
      }),
    );
  });

  it("rejects empty bodies", async () => {
    const out = await addApprovalCommentAction("ap-1", "   ");
    expect(out.ok).toBe(false);
    expect(appendCommentMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when approval is missing", async () => {
    getApprovalMock.mockReturnValue(null);
    const out = await addApprovalCommentAction("ap-1", "hi");
    expect(out.ok).toBe(false);
  });
});

describe("createPolicyAction + deletePolicyAction", () => {
  it("create returns the policy id when DB returns one", async () => {
    createPolicyMock.mockReturnValue({ id: "pol-1" });
    const out = await createPolicyAction({
      project_slug: "demo",
      action_type: "spend",
      auto_decision: "approve",
      max_cost_usd: 50,
    });
    expect(out).toEqual({ ok: true, policy_id: "pol-1" });
    expect(createPolicyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project_slug: "demo",
        action_type: "spend",
        max_cost_usd: 50,
        auto_decision: "approve",
        created_by_kind: "user",
      }),
    );
  });

  it("create validates inputs", async () => {
    // @ts-expect-error invalid on purpose
    const out = await createPolicyAction({ project_slug: "", action_type: "" });
    expect(out.ok).toBe(false);
  });

  it("delete returns ok:true on success and ok:false on missing", async () => {
    deletePolicyMock.mockReturnValueOnce(true);
    expect(await deletePolicyAction("pol-1")).toEqual({ ok: true });
    deletePolicyMock.mockReturnValueOnce(false);
    const out = await deletePolicyAction("missing");
    expect(out.ok).toBe(false);
  });
});
