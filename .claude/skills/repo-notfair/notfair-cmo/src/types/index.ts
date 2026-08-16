// Shared types. Imported by both server (Next.js API + MCP) and client (React).

export type Project = {
  id: string;
  slug: string;
  display_name: string;
  created_at: string;
  archived_at: string | null;
  /**
   * Selected Google Ads customer ID for this project. Bearers from
   * notfair.co/api/mcp/google_ads can grant access to multiple customer
   * accounts; the onboarding flow asks the user to pick one and persists
   * it here so the audit + later automation target the right account.
   * Null until the user picks (or until /onboarding gets re-run).
   */
  google_ads_account_id: string | null;
  /**
   * Selected Meta Ads ad-account id (e.g. "act_123456"). Same pattern as
   * google_ads_account_id: the notfair-metaads bearer may grant access
   * to multiple ad accounts, and onboarding asks the user to pick the
   * one this project should target. Null until picked.
   */
  meta_ads_account_id: string | null;
  /**
   * Selected Google Search Console property id (e.g. "sc-domain:example.com"
   * or "https://example.com/"). Same idea as the ad-account fields: the
   * notfair-googlesearchconsole bearer may cover multiple verified
   * properties, and we persist the chosen one. Null until picked.
   */
  gsc_property_id: string | null;
  /**
   * Optional inputs the user provided at onboarding so the CMO has a
   * starting point for its first task (writing PROJECT.md). Both are
   * free-text — the CMO uses whichever exist + decides how to explore.
   */
  website_url: string | null;
  codebase_path: string | null;
  /**
   * Which harness adapter runs this project's agents. Picked at
   * onboarding. "codex-local" is the recommended default; "claude-code-local"
   * runs through Anthropic's Claude Code CLI instead.
   */
  harness_adapter: "claude-code-local" | "codex-local";
};

export type TaskStatus =
  | "proposed"
  | "approved"
  | "working"
  | "blocked"
  | "done"
  | "failed"
  | "cancelled";

// ┌──────────┐  user approves                ┌──────────┐  agent picks up  ┌─────────┐
// │ proposed │ ─────────────────────────────▶│ approved │ ────────────────▶│ running │◀─┐
// └──────────┘  needs_approval               └──────────┘                   └────┬────┘  │
//      │   ▲                                                                     │       │
//      │   └── user approves from inbox ──────────────────────────────┐         │       │
//      │                                                              │         ▼       │
//      │                                                       ┌───────────────┐        │
//      │                                                       │   blocked     │────────┘
//      │                                                       └───────────────┘ approval resolved
//      │                                                              │
//      │                                                              ▼
//      │                                                       ┌───────────────┐
//      └─ user/CMO cancels ───────────────────────────────────▶│ cancelled / failed / succeeded │
//                                                              └───────────────┘
export type Task = {
  id: string;
  /**
   * Human-readable per-project ID like "demo7-3". Used in URLs and UI
   * surfaces. PK stays as `id` (UUID) for FK integrity; display_id is
   * the surface humans see. Backfilled for pre-004 tasks; always set
   * for new tasks.
   */
  display_id: string;
  project_slug: string;
  /** Assignee — the agent expected to do the work. */
  agent_id: string;
  /** Short label shown on task cards (e.g., "Set up daily anomaly check"). */
  title: string | null;
  /** Full request body. Often a PRD-style description from the CMO. */
  brief: string;
  success_criteria: string | null;
  deadline_iso: string | null;
  status: TaskStatus;
  result_json: string | null;
  error_message: string | null;
  /**
   * OpenClaw chat session id where the assignee picks up this task. Null
   * until first opened; populated on first /tasks/[id] visit + remains
   * stable forever after.
   */
  thread_id: string | null;
  /**
   * Agent that created this task. For CMO-originated tasks this is the
   * CMO agent id; in v1.1 specialists creating sub-tasks fill in their
   * own id so the chain back to the planner is walkable.
   */
  assigner_agent_id: string | null;
  /**
   * Task that must reach `done` before this one can start. When set, the
   * task is created in `blocked` status; the orchestrator clears this
   * pointer and flips blocked→proposed (then kicks off) when the blocker
   * resolves. Co-exists with approval-blocking: approval-blocked tasks
   * have a null blocked_by_task_id and resolve via the approval-wakeup
   * path. Null for tasks with no upstream dependency.
   */
  blocked_by_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApprovalStatus =
  | "pending"
  | "revision_requested"
  | "approved"
  | "rejected"
  | "expired";

export type ApprovalType =
  | "spend"
  | "content_publishing"
  | "new_channel"
  | "bid_change"
  | "audience_change"
  | "other";

/** Who made the decision on an approval. 'policy' = auto-decided by a rule. */
export type ApprovalDecidedByKind = "user" | "agent" | "policy";

/** Author of a comment on an approval thread. 'system' = automated note. */
export type ApprovalCommentAuthorKind = "user" | "agent" | "system";

export type Approval = {
  id: string;
  project_slug: string;
  agent_id: string;
  /** Task this approval is gating, if any. Filled when the agent emits
   *  <request_approval> inside a task context; null for free-standing asks. */
  task_id: string | null;
  action_summary: string;
  action_type: ApprovalType;
  cost_estimate_usd: number;
  reasoning: string | null;
  payload_json: string;
  status: ApprovalStatus;
  /** Free-text reason the decider attached on resolve/revision_requested. */
  decision_note: string | null;
  decided_by_kind: ApprovalDecidedByKind | null;
  decided_by_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

/** Open question raised by an agent via the `ask_user_question` MCP tool.
 *  Modeled like Approval — a pending row blocks the task; the user answers
 *  (option or free-text) or cancels; the wake-up streams the resolution
 *  back to the agent as a [SYSTEM] message on the task thread. */
export type QuestionStatus = "pending" | "answered" | "cancelled";

export type Question = {
  id: string;
  project_slug: string;
  agent_id: string;
  /** Task this question is anchored to. Null for free-standing asks. */
  task_id: string | null;
  prompt: string;
  /** Optional multiple-choice hints rendered as buttons in the UI. JSON
   *  array of strings. Empty array when the agent didn't supply choices. */
  options_json: string;
  status: QuestionStatus;
  /** Zero-based index into options_json[] when the user picked an option.
   *  Null when the user only typed free-text or cancelled. */
  answer_option_index: number | null;
  /** Free-text answer the user typed alongside / instead of an option.
   *  Null when the user only clicked an option or cancelled. */
  answer_text: string | null;
  /** Who resolved the question — user (typical) vs system (future timeout). */
  resolved_by_kind: "user" | "system" | null;
  created_at: string;
  resolved_at: string | null;
};

export type ApprovalComment = {
  id: string;
  approval_id: string;
  author_kind: ApprovalCommentAuthorKind;
  author_id: string | null;
  body: string;
  created_at: string;
};

/** "Always allow / reject" rule consulted before a pending approval is created.
 *  Matches by (project_slug, action_type) + optional agent_id + optional cost cap. */
export type ApprovalPolicy = {
  id: string;
  project_slug: string;
  action_type: ApprovalType;
  /** Restrict to a single agent. Null = applies to any agent in the project. */
  agent_id: string | null;
  /** Maximum cost the policy auto-decides for. Null = no cap. */
  max_cost_usd: number | null;
  auto_decision: "approve" | "reject";
  note: string | null;
  created_at: string;
  created_by_kind: "user" | "agent";
  created_by_id: string | null;
};

export type CostEventSource = "llm" | "google_ads" | "gsc" | "other";

export type CostEvent = {
  id: string;
  project_slug: string;
  agent_id: string | null;
  source: CostEventSource;
  amount_usd: number;
  ref: string | null;
  occurred_at: string;
};

export type OAuthProvider = "google_ads" | "gsc";

export type OAuthToken = {
  id: string;
  project_slug: string;
  provider: OAuthProvider;
  account_label: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
  scope: string;
  created_at: string;
  updated_at: string;
};

export type ToolErrorEnvelope = {
  ok: false;
  error_code: string;
  message: string;
  retryable: boolean;
  user_message: string;
};

export type ToolSuccessEnvelope<T> = {
  ok: true;
  data: T;
};

export type ToolResult<T> = ToolSuccessEnvelope<T> | ToolErrorEnvelope;
