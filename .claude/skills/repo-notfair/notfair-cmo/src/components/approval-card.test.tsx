// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const approveMock = vi.fn();
const rejectMock = vi.fn();
const createPolicyMock = vi.fn();
const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock("@/server/actions/approvals", () => ({
  approveAction: (...a: unknown[]) => approveMock(...a),
  rejectAction: (...a: unknown[]) => rejectMock(...a),
  createPolicyAction: (...a: unknown[]) => createPolicyMock(...a),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastErrorMock(...a),
    success: (...a: unknown[]) => toastSuccessMock(...a),
  },
}));

import { ApprovalCard } from "./approval-card";
import type { Approval } from "@/types";

function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "ap-1",
    project_slug: "demo",
    agent_id: "demo-google-ads",
    task_id: null,
    action_summary: "Raise CPC bid on /signup keyword",
    action_type: "bid_change",
    cost_estimate_usd: 12.5,
    reasoning: null,
    payload_json: "{}",
    status: "pending",
    decision_note: null,
    decided_by_kind: null,
    decided_by_id: null,
    created_at: new Date(Date.now() - 90_000).toISOString(),
    resolved_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  approveMock.mockReset();
  rejectMock.mockReset();
  createPolicyMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

describe("ApprovalCard — header & metadata", () => {
  it("renders summary, action-type label, status pill, cost, agent, timestamp", () => {
    render(<ApprovalCard approval={makeApproval()} />);
    expect(screen.getByText("Raise CPC bid on /signup keyword")).toBeInTheDocument();
    expect(screen.getByText("Bid change")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("demo-google-ads")).toBeInTheDocument();
    expect(screen.getByText(/m ago|s ago/)).toBeInTheDocument();
  });

  it("hides the cost line when cost_estimate_usd is zero", () => {
    render(<ApprovalCard approval={makeApproval({ cost_estimate_usd: 0 })} />);
    expect(screen.queryByText(/Cost:/)).not.toBeInTheDocument();
  });

  it("renders reasoning inline (no Why? toggle)", () => {
    render(
      <ApprovalCard approval={makeApproval({ reasoning: "Predicted +18% CTR" })} />,
    );
    expect(screen.getByText("Predicted +18% CTR")).toBeInTheDocument();
    // Old "Why?" toggle should be gone.
    expect(screen.queryByRole("button", { name: "Why?" })).not.toBeInTheDocument();
  });

  it("does NOT render a thread or comment input (removed in this iteration)", () => {
    render(<ApprovalCard approval={makeApproval()} />);
    expect(screen.queryByPlaceholderText("Add a comment…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Comment" })).not.toBeInTheDocument();
  });

  it("shows the 'Auto by policy' badge when decided_by_kind=policy", () => {
    render(
      <ApprovalCard
        approval={makeApproval({
          status: "approved",
          decided_by_kind: "policy",
          decided_by_id: "pol-1",
          resolved_at: new Date().toISOString(),
        })}
      />,
    );
    expect(screen.getByText("Auto by policy")).toBeInTheDocument();
  });

  it("sets the region aria-label to action_summary", () => {
    render(<ApprovalCard approval={makeApproval({ action_summary: "X-summary" })} />);
    expect(screen.getByRole("region", { name: "X-summary" })).toBeInTheDocument();
  });
});

describe("ApprovalCard — approve (one-click)", () => {
  it("calls approveAction with just the id and shows success toast", async () => {
    approveMock.mockResolvedValue({ ok: true });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(approveMock).toHaveBeenCalledWith("ap-1");
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Approved — agent is being notified",
      );
    });
  });

  it("surfaces server error via toast", async () => {
    approveMock.mockResolvedValue({ ok: false, error: "boom" });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("boom");
    });
  });
});

describe("ApprovalCard — Deny modal", () => {
  it("clicking Deny opens the modal but does not call rejectAction yet", () => {
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(screen.getByText("What do you want to change?")).toBeInTheDocument();
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it("'Reject without comments' rejects with no note", async () => {
    rejectMock.mockResolvedValue({ ok: true });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Reject without comments" }),
    );
    await waitFor(() => {
      expect(rejectMock).toHaveBeenCalledWith("ap-1", undefined);
      expect(toastSuccessMock).toHaveBeenCalledWith("Rejected");
    });
  });

  it("'Reject with comment' sends the typed note", async () => {
    rejectMock.mockResolvedValue({ ok: true });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    fireEvent.change(
      screen.getByPlaceholderText(/Wait until next week/),
      { target: { value: "Hold off until legal review" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject with comment" }));
    await waitFor(() => {
      expect(rejectMock).toHaveBeenCalledWith(
        "ap-1",
        "Hold off until legal review",
      );
      expect(toastSuccessMock).toHaveBeenCalledWith("Rejected with feedback");
    });
  });

  it("'Reject with comment' button is disabled until the user types something", () => {
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    const withCommentBtn = screen.getByRole("button", {
      name: "Reject with comment",
    });
    expect(withCommentBtn).toBeDisabled();
    fireEvent.change(
      screen.getByPlaceholderText(/Wait until next week/),
      { target: { value: "x" } },
    );
    expect(withCommentBtn).not.toBeDisabled();
  });
});

describe("ApprovalCard — Always approve policy", () => {
  it("opens the policy form scoped to this agent by default", () => {
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: /Always approve/ }));
    expect(screen.getByText("Create auto-approval policy")).toBeInTheDocument();
  });

  it("Save policy calls createPolicyAction with the right shape", async () => {
    createPolicyMock.mockResolvedValue({ ok: true, policy_id: "pol-1" });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: /Always approve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => {
      const payload = createPolicyMock.mock.calls[0]![0]!;
      expect(payload.project_slug).toBe("demo");
      expect(payload.action_type).toBe("bid_change");
      expect(payload.agent_id).toBe("demo-google-ads");
      expect(payload.auto_decision).toBe("approve");
    });
  });

  it("scope=any sets agent_id to null", async () => {
    createPolicyMock.mockResolvedValue({ ok: true });
    render(<ApprovalCard approval={makeApproval()} />);
    fireEvent.click(screen.getByRole("button", { name: /Always approve/ }));
    fireEvent.click(screen.getByLabelText(/From any agent/));
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => {
      const payload = createPolicyMock.mock.calls[0]![0]!;
      expect(payload.agent_id).toBeNull();
    });
  });
});

describe("ApprovalCard — resolved state", () => {
  it("hides decision buttons and shows decision_note when resolved", () => {
    render(
      <ApprovalCard
        approval={makeApproval({
          status: "approved",
          decision_note: "Ship it.",
          resolved_at: new Date().toISOString(),
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
    expect(screen.getByText("Decision note")).toBeInTheDocument();
    expect(screen.getByText("Ship it.")).toBeInTheDocument();
  });
});
