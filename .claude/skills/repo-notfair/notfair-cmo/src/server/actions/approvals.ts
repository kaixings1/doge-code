"use server";

import { revalidatePath } from "next/cache";
import {
  appendComment,
  createPolicy,
  deletePolicy,
  getApproval,
  requestApprovalRevision,
  resolveApproval,
} from "@/server/db/approvals";
import { wakeTaskOnApprovalResolution } from "@/server/orchestration/approval-wakeup";
import type { ApprovalType } from "@/types";

export type ActionResult = { ok: boolean; error?: string };

/**
 * Centralized "decide and wake" path for human-driven approvals. Resolves
 * the row, posts a comment trail (so the inbox shows the decision), and
 * kicks the task wake-up fire-and-forget so the agent picks up the
 * decision on its next turn.
 */
async function decideApproval(
  id: string,
  status: "approved" | "rejected",
  options: { decision_note?: string; decided_by_id?: string } = {},
): Promise<ActionResult> {
  const before = getApproval(id);
  if (!before) return { ok: false, error: "Approval not found." };
  if (before.status !== "pending" && before.status !== "revision_requested") {
    return { ok: false, error: `Approval is already ${before.status}.` };
  }

  const after = resolveApproval(id, status, {
    decision_note: options.decision_note ?? null,
    decided_by_kind: "user",
    decided_by_id: options.decided_by_id ?? null,
  });
  if (!after) return { ok: false, error: "Approval row vanished." };

  appendComment({
    approval_id: id,
    author_kind: "user",
    author_id: options.decided_by_id ?? null,
    body:
      options.decision_note?.trim() ||
      (status === "approved" ? "Approved." : "Rejected."),
  });

  // Fire-and-forget wake-up so the form post returns instantly.
  void wakeTaskOnApprovalResolution(after).catch((err) => {
    console.error("[approve-action] wake-up failed:", err);
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function approveAction(
  id: string,
  decision_note?: string,
): Promise<ActionResult> {
  return decideApproval(id, "approved", { decision_note });
}

export async function rejectAction(
  id: string,
  decision_note?: string,
): Promise<ActionResult> {
  return decideApproval(id, "rejected", { decision_note });
}

/**
 * Push back on the agent with a comment + revision_requested status. The
 * agent's next turn sees the feedback and is expected to emit a fresh
 * <request_approval> with a refined plan.
 */
export async function requestRevisionAction(
  id: string,
  decision_note: string,
): Promise<ActionResult> {
  if (!decision_note.trim()) {
    return { ok: false, error: "A note is required when requesting revision." };
  }
  const before = getApproval(id);
  if (!before) return { ok: false, error: "Approval not found." };
  if (before.status !== "pending") {
    return {
      ok: false,
      error: `Can only request revision on a pending approval (got ${before.status}).`,
    };
  }
  const after = requestApprovalRevision(id, {
    decision_note,
    decided_by_kind: "user",
  });
  if (!after) return { ok: false, error: "Revision request failed." };

  appendComment({
    approval_id: id,
    author_kind: "user",
    body: decision_note,
  });

  void wakeTaskOnApprovalResolution(after).catch((err) => {
    console.error("[request-revision-action] wake-up failed:", err);
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Free-form comment without changing the approval status. */
export async function addApprovalCommentAction(
  id: string,
  body: string,
): Promise<ActionResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Comment cannot be empty." };
  const approval = getApproval(id);
  if (!approval) return { ok: false, error: "Approval not found." };

  appendComment({
    approval_id: id,
    author_kind: "user",
    body: trimmed,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export type CreatePolicyActionInput = {
  project_slug: string;
  action_type: ApprovalType;
  agent_id?: string | null;
  max_cost_usd?: number | null;
  auto_decision: "approve" | "reject";
  note?: string | null;
};

export async function createPolicyAction(
  input: CreatePolicyActionInput,
): Promise<ActionResult & { policy_id?: string }> {
  if (!input.project_slug || !input.action_type) {
    return { ok: false, error: "project_slug and action_type are required." };
  }
  const policy = createPolicy({
    project_slug: input.project_slug,
    action_type: input.action_type,
    agent_id: input.agent_id ?? null,
    max_cost_usd: input.max_cost_usd ?? null,
    auto_decision: input.auto_decision,
    note: input.note ?? null,
    created_by_kind: "user",
  });
  revalidatePath("/", "layout");
  return { ok: true, policy_id: policy.id };
}

export async function deletePolicyAction(id: string): Promise<ActionResult> {
  const ok = deletePolicy(id);
  if (!ok) return { ok: false, error: "Policy not found." };
  revalidatePath("/", "layout");
  return { ok: true };
}
