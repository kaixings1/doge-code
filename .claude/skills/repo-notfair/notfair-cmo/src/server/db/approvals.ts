import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type {
  Approval,
  ApprovalComment,
  ApprovalCommentAuthorKind,
  ApprovalDecidedByKind,
  ApprovalPolicy,
  ApprovalStatus,
  ApprovalType,
} from "@/types";

export type CreateApprovalInput = {
  project_slug: string;
  agent_id: string;
  task_id?: string | null;
  action_summary: string;
  action_type: ApprovalType;
  cost_estimate_usd: number;
  reasoning?: string | null;
  payload: unknown;
};

/**
 * Returns the inserted approval row. When a matching auto-approve/reject
 * policy fired, the row comes back already in its terminal state with
 * `decided_by_kind = 'policy'` and `decided_by_id = policy.id` — callers
 * that need to fire wake-up logic can detect that without an extra read.
 */
export function createApproval(input: CreateApprovalInput): Approval {
  const db = getDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  // Consult the "always allow / always reject" policies BEFORE writing a
  // pending row. If a policy matches, write the row in its terminal state
  // straight away so the agent can be woken in the same tick. Mirrors
  // paperclip's intent of decoupling the decision from human latency.
  const policy = findMatchingPolicy(
    input.project_slug,
    input.action_type,
    input.agent_id,
    input.cost_estimate_usd,
  );

  const initialStatus: ApprovalStatus = policy
    ? policy.auto_decision === "approve"
      ? "approved"
      : "rejected"
    : "pending";

  db.prepare(
    `INSERT INTO approvals
       (id, project_slug, agent_id, task_id, action_summary, action_type,
        cost_estimate_usd, reasoning, payload_json, status,
        decision_note, decided_by_kind, decided_by_id,
        created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.project_slug,
    input.agent_id,
    input.task_id ?? null,
    input.action_summary,
    input.action_type,
    input.cost_estimate_usd,
    input.reasoning ?? null,
    JSON.stringify(input.payload ?? {}),
    initialStatus,
    policy ? (policy.note ?? "Auto-decided by policy.") : null,
    policy ? "policy" : null,
    policy ? policy.id : null,
    createdAt,
    policy ? createdAt : null,
  );

  // If a policy auto-resolved, append a system comment so the thread shows
  // a clear trail of "why was this approved without me clicking anything?".
  if (policy) {
    appendComment({
      approval_id: id,
      author_kind: "system",
      author_id: policy.id,
      body: `Auto-${policy.auto_decision === "approve" ? "approved" : "rejected"} by policy: ${policy.note ?? "(no note)"}`,
    });
  }

  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as Approval;
  return row;
}

/** Pending OR revision_requested — anything still needing human attention. */
export function listActionableApprovals(project_slug: string): Approval[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM approvals
        WHERE project_slug = ?
          AND status IN ('pending','revision_requested')
        ORDER BY created_at DESC`,
    )
    .all(project_slug) as Approval[];
}

/** Back-compat: caller wanted only strictly-pending rows. */
export function listPendingApprovals(project_slug: string): Approval[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM approvals WHERE project_slug = ? AND status = 'pending' ORDER BY created_at DESC",
    )
    .all(project_slug) as Approval[];
}

/** Resolved approvals (approved | rejected | expired) — for the history tab. */
export function listResolvedApprovals(project_slug: string, limit = 50): Approval[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM approvals
        WHERE project_slug = ?
          AND status IN ('approved','rejected','expired')
        ORDER BY resolved_at DESC NULLS LAST, created_at DESC
        LIMIT ?`,
    )
    .all(project_slug, limit) as Approval[];
}

export function listApprovalsForTask(task_id: string): Approval[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM approvals WHERE task_id = ? ORDER BY created_at DESC")
    .all(task_id) as Approval[];
}

export function getApproval(id: string): Approval | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return (row as Approval) ?? null;
}

/** Count of actionable (pending + revision_requested) approvals — sidebar badge. */
export function actionableApprovalCount(project_slug: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM approvals
        WHERE project_slug = ? AND status IN ('pending','revision_requested')`,
    )
    .get(project_slug) as { n: number };
  return row.n;
}

/** Back-compat shim: pendingApprovalCount counts strict 'pending'. The sidebar
 *  badge has been switched to actionableApprovalCount so this is unused inside
 *  the repo but exported so external callers (tests, scripts) keep working. */
export function pendingApprovalCount(project_slug: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM approvals WHERE project_slug = ? AND status = 'pending'")
    .get(project_slug) as { n: number };
  return row.n;
}

export type ResolveApprovalOptions = {
  decision_note?: string | null;
  decided_by_kind?: ApprovalDecidedByKind;
  decided_by_id?: string | null;
};

/**
 * Conditional update: only flips a row that's still actionable (pending or
 * revision_requested). The WHERE clause prevents a stale caller from
 * re-resolving an already-terminal approval. Returns the post-update row
 * (which may be unchanged if the transition didn't apply) or null when the
 * id is missing.
 *
 * Wakeup logic should NOT live here — call `decideApproval()` in the
 * actions layer if you want the post-resolution task wake-up.
 */
export function resolveApproval(
  id: string,
  status: Exclude<ApprovalStatus, "pending" | "revision_requested">,
  options: ResolveApprovalOptions = {},
): Approval | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE approvals
        SET status = ?,
            resolved_at = ?,
            decision_note = COALESCE(?, decision_note),
            decided_by_kind = COALESCE(?, decided_by_kind),
            decided_by_id = COALESCE(?, decided_by_id)
      WHERE id = ?
        AND status IN ('pending','revision_requested')`,
  ).run(
    status,
    now,
    options.decision_note ?? null,
    options.decided_by_kind ?? null,
    options.decided_by_id ?? null,
    id,
  );
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return (row as Approval) ?? null;
}

/**
 * Push back on the agent: flip pending → revision_requested with a note.
 * The agent's next turn sees the note + can resubmit a new <request_approval>.
 * From revision_requested the only forward transitions are approved/rejected.
 */
export function requestApprovalRevision(
  id: string,
  options: ResolveApprovalOptions & { decision_note: string },
): Approval | null {
  const db = getDb();
  db.prepare(
    `UPDATE approvals
        SET status = 'revision_requested',
            decision_note = ?,
            decided_by_kind = COALESCE(?, decided_by_kind),
            decided_by_id = COALESCE(?, decided_by_id)
      WHERE id = ?
        AND status = 'pending'`,
  ).run(
    options.decision_note,
    options.decided_by_kind ?? null,
    options.decided_by_id ?? null,
    id,
  );
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return (row as Approval) ?? null;
}

// ── Comments ────────────────────────────────────────────────────────

export type AppendCommentInput = {
  approval_id: string;
  author_kind: ApprovalCommentAuthorKind;
  author_id?: string | null;
  body: string;
};

export function appendComment(input: AppendCommentInput): ApprovalComment {
  const db = getDb();
  const comment: ApprovalComment = {
    id: randomUUID(),
    approval_id: input.approval_id,
    author_kind: input.author_kind,
    author_id: input.author_id ?? null,
    body: input.body,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO approval_comments (id, approval_id, author_kind, author_id, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    comment.id,
    comment.approval_id,
    comment.author_kind,
    comment.author_id,
    comment.body,
    comment.created_at,
  );
  return comment;
}

export function listComments(approval_id: string): ApprovalComment[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM approval_comments WHERE approval_id = ? ORDER BY created_at ASC",
    )
    .all(approval_id) as ApprovalComment[];
}

// ── Policies ────────────────────────────────────────────────────────

export type CreatePolicyInput = {
  project_slug: string;
  action_type: ApprovalType;
  agent_id?: string | null;
  max_cost_usd?: number | null;
  auto_decision: "approve" | "reject";
  note?: string | null;
  created_by_kind: "user" | "agent";
  created_by_id?: string | null;
};

export function createPolicy(input: CreatePolicyInput): ApprovalPolicy {
  const db = getDb();
  const policy: ApprovalPolicy = {
    id: randomUUID(),
    project_slug: input.project_slug,
    action_type: input.action_type,
    agent_id: input.agent_id ?? null,
    max_cost_usd: input.max_cost_usd ?? null,
    auto_decision: input.auto_decision,
    note: input.note ?? null,
    created_at: new Date().toISOString(),
    created_by_kind: input.created_by_kind,
    created_by_id: input.created_by_id ?? null,
  };
  db.prepare(
    `INSERT INTO approval_policies
       (id, project_slug, action_type, agent_id, max_cost_usd, auto_decision, note, created_at, created_by_kind, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    policy.id,
    policy.project_slug,
    policy.action_type,
    policy.agent_id,
    policy.max_cost_usd,
    policy.auto_decision,
    policy.note,
    policy.created_at,
    policy.created_by_kind,
    policy.created_by_id,
  );
  return policy;
}

export function listPolicies(project_slug: string): ApprovalPolicy[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM approval_policies WHERE project_slug = ? ORDER BY created_at DESC",
    )
    .all(project_slug) as ApprovalPolicy[];
}

export function deletePolicy(id: string): boolean {
  const db = getDb();
  const info = db.prepare("DELETE FROM approval_policies WHERE id = ?").run(id);
  return info.changes > 0;
}

/**
 * Find the first policy that matches a candidate approval. Matching rules:
 *   - same project_slug
 *   - same action_type
 *   - agent_id matches (NULL agent_id in policy = any agent)
 *   - cost ≤ max_cost_usd (NULL max_cost_usd = no cap)
 *
 * Most-specific wins: agent-scoped policies are preferred over wildcard;
 * cost-capped policies preferred over uncapped (tighter cap first).
 */
export function findMatchingPolicy(
  project_slug: string,
  action_type: ApprovalType,
  agent_id: string,
  cost_estimate_usd: number,
): ApprovalPolicy | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM approval_policies
        WHERE project_slug = ?
          AND action_type = ?
          AND (agent_id IS NULL OR agent_id = ?)
          AND (max_cost_usd IS NULL OR max_cost_usd >= ?)
        ORDER BY
          CASE WHEN agent_id IS NULL THEN 1 ELSE 0 END,
          CASE WHEN max_cost_usd IS NULL THEN 1 ELSE 0 END,
          max_cost_usd ASC NULLS LAST,
          created_at DESC`,
    )
    .all(project_slug, action_type, agent_id, cost_estimate_usd) as ApprovalPolicy[];
  return rows[0] ?? null;
}
