/**
 * HarnessAdapter — notfair-cmo's plug-in shape for a local AI coding agent.
 *
 * Inspired by paperclip's ServerAdapterModule but pared down: notfair-cmo runs
 * locally only, so there's no remote execution target, no workspace bridge,
 * no skill catalog interop. An adapter only needs to:
 *
 *   1. Validate its environment (binary installed, auth OK)        — testEnvironment
 *   2. Stream a chat turn for an agent                              — execute
 *   3. Provision an agent workspace                                 — provisionAgent
 *   4. Register / unregister an MCP server for an agent             — registerMcp / unregisterMcp
 *
 * Everything else (cron, MCP token storage, session/transcript persistence,
 * agent metadata) lives in notfair-cmo and is shared across adapters.
 */
export type HarnessAdapterId = "claude-code-local" | "codex-local";

export interface HarnessEnvironmentHealth {
  ok: boolean;
  /** Short label for the status row (e.g. "Claude Code 1.0.42"). */
  versionLabel?: string;
  /** Path to the binary that was probed. */
  binaryPath?: string;
  /** Auth state: "ok", "missing", "expired", or "unknown" when not applicable. */
  auth?: "ok" | "missing" | "expired" | "unknown";
  /** Human-readable failure reason when ok=false. */
  message?: string;
}

export interface AgentProvisionSpec {
  /** Project slug (e.g. "acme"). */
  projectSlug: string;
  /** Agent backend id (e.g. "acme-cmo-greg"). */
  agentId: string;
  /** Personal display name (e.g. "Greg"). */
  displayName: string;
  /** Role / template key (e.g. "cmo", "google_ads"). */
  templateKey: string;
  /** Absolute path to the agent's workspace directory. */
  workspaceDir: string;
  /** The fully-rendered IDENTITY.md the agent should run with. */
  identityMd: string;
  /** The shared SKILL.md (orchestration MCP usage etc.). Optional sidecar copy. */
  skillMd?: string;
  /** PROJECT.md context, if a project brief exists yet. */
  projectMd?: string;
}

export interface McpRegistrationSpec {
  /** Logical server name (e.g. "notfair-googleads"). */
  serverName: string;
  /** Agent this server should be available to. */
  agentId: string;
  /** Project slug — adapters that scope MCP per workspace use this. */
  projectSlug: string;
  /** Transport: stdio command, HTTP URL, or local SSE. */
  transport:
    | { type: "stdio"; command: string; args: string[]; env?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string> };
}

/**
 * Execution context for one chat turn.
 *
 * The adapter knows nothing about notfair-cmo SQLite or routes — it gets the
 * raw inputs it needs (agent identity, workspace, message), runs the harness,
 * and yields HarnessEvents that the caller serializes onto SSE / persists.
 */
export interface HarnessExecuteContext {
  projectSlug: string;
  agentId: string;
  workspaceDir: string;
  /** The user message for this turn. */
  message: string;
  /**
   * Stable thread identifier owned by notfair-cmo (the `sessions.id` UUID).
   * Adapters MUST NOT pass this to their CLI's resume flag — the harness
   * doesn't know it. Used only for logging / correlation.
   */
  threadId: string;
  /**
   * The harness's own session id from a prior turn on this thread, if any.
   * When set, adapters pass it to their CLI's resume flag (e.g. claude
   * `--resume`, codex `exec resume`). Null on the first turn of a thread.
   */
  harnessSessionId?: string | null;
  /** Optional cancellation. When aborted the adapter kills its subprocess. */
  signal?: AbortSignal;
}

export type HarnessEvent =
  | { kind: "delta"; text: string }
  | {
      kind: "tool";
      phase: "start" | "update" | "result";
      toolCallId: string;
      name: string;
      label?: string;
    }
  | { kind: "lifecycle"; phase: string }
  | { kind: "final"; text: string }
  | {
      kind: "error";
      message: string;
      /**
       * Set true when the message is mid-stream retry chatter (e.g. Codex's
       * MCP reconnect loop printing "Reconnecting... 2/5"), not a terminal
       * failure. Callers that need a single error to surface should prefer
       * the most recent non-transient one.
       */
      transient?: boolean;
    }
  /**
   * Adapter has learned the harness's own session id for this thread. The
   * caller should persist it on the `sessions.harness_session_id` column
   * so the next turn can pass it to the adapter as `harnessSessionId` for
   * resume. Emitted at most once per turn.
   */
  | { kind: "session"; harnessSessionId: string };

export interface HarnessAdapter {
  readonly id: HarnessAdapterId;

  testEnvironment(): Promise<HarnessEnvironmentHealth>;

  execute(ctx: HarnessExecuteContext): AsyncGenerator<HarnessEvent, void, void>;

  provisionAgent(spec: AgentProvisionSpec): Promise<void>;

  registerMcp(spec: McpRegistrationSpec): Promise<void>;
  unregisterMcp(spec: McpUnregistrationSpec): Promise<void>;
}

export interface McpUnregistrationSpec {
  /** Logical server name. */
  serverName: string;
  /** Project slug — Codex's project-namespaced global config key. */
  projectSlug: string;
  /** Agent id — Claude Code's per-workspace `.mcp.json` lives under it. */
  agentId: string;
}
