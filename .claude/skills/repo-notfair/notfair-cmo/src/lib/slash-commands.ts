/**
 * Slash command catalog + local executor.
 *
 * Ported from OpenClaw's web UI:
 *   - ui/src/ui/chat/slash-commands.ts        (catalog + LOCAL_COMMANDS set)
 *   - ui/src/ui/chat/slash-command-executor.ts (action-based dispatcher)
 *
 * Rules:
 *   - executeLocal=true → command is handled by the client; not sent to the agent.
 *   - Anything else → message goes to OpenClaw verbatim.
 *
 * For the V1 client we wire only the no-gateway-RPC locals (clear, new, help,
 * stop). The rest carry executeLocal=false and pass through to the agent.
 */

export type SlashCommandCategory =
  | "session"
  | "model"
  | "status"
  | "agents"
  | "tools"
  | "advanced";

export type SlashCommandTier = "essential" | "standard" | "power";

export type SlashCommand = {
  /** Canonical key (matches OpenClaw registry where applicable). */
  key: string;
  /** Display name (without the leading slash). */
  name: string;
  /** Short description shown in the menu. */
  description: string;
  /** Optional argument hint shown beside the name. */
  args?: string;
  category: SlashCommandCategory;
  tier: SlashCommandTier;
  /** When true, AgentChat handles this client-side and does NOT call openclaw. */
  executeLocal?: boolean;
  /** Text inserted into the textarea when the user picks this. Defaults to `/${name} `. */
  insert?: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  // Session — local-only in OpenClaw web UI
  {
    key: "clear",
    name: "clear",
    description: "Clear the visible chat buffer (trajectory on disk is kept).",
    category: "session",
    tier: "essential",
    executeLocal: true,
  },
  {
    key: "new",
    name: "new",
    description: "Start a new session (creates a fresh thread).",
    category: "session",
    tier: "essential",
    executeLocal: true,
  },
  {
    key: "stop",
    name: "stop",
    description: "Stop the in-flight response.",
    category: "session",
    tier: "essential",
    executeLocal: true,
  },
  {
    key: "help",
    name: "help",
    description: "Show available commands.",
    category: "status",
    tier: "essential",
    executeLocal: true,
  },

  // Status — sent to the agent / OpenClaw handles
  {
    key: "commands",
    name: "commands",
    description: "List all slash commands.",
    category: "status",
    tier: "power",
  },
  {
    key: "status",
    name: "status",
    description: "Show current status.",
    category: "status",
    tier: "essential",
  },
  {
    key: "whoami",
    name: "whoami",
    description: "Show your identity / caller.",
    category: "status",
    tier: "standard",
  },
  {
    key: "usage",
    name: "usage",
    description: "Show token / cost usage for this session.",
    category: "status",
    tier: "standard",
  },

  // Tools
  {
    key: "tools",
    name: "tools",
    description: "List available runtime tools.",
    category: "tools",
    tier: "standard",
  },
  {
    key: "skill",
    name: "skill",
    description: "Run a skill by name.",
    args: "<name>",
    category: "tools",
    tier: "standard",
    insert: "/skill ",
  },

  // Session / context management — pass through to OpenClaw
  {
    key: "compact",
    name: "compact",
    description: "Compact the session context to reduce token use.",
    category: "session",
    tier: "standard",
  },
  {
    key: "reset",
    name: "reset",
    description: "Reset the current session.",
    category: "session",
    tier: "standard",
  },

  // Model / behaviour directives — pass through to OpenClaw
  {
    key: "model",
    name: "model",
    description: "Override model for this turn.",
    args: "<id>",
    category: "model",
    tier: "standard",
    insert: "/model ",
  },
  {
    key: "think",
    name: "think",
    description: "Directive: enable extended thinking.",
    category: "model",
    tier: "standard",
  },
  {
    key: "fast",
    name: "fast",
    description: "Directive: disable thinking for fastest response.",
    category: "model",
    tier: "standard",
  },
  {
    key: "verbose",
    name: "verbose",
    description: "Directive: verbose progress output.",
    category: "model",
    tier: "standard",
  },
  {
    key: "trace",
    name: "trace",
    description: "Directive: include trace details.",
    category: "model",
    tier: "power",
  },
  {
    key: "reasoning",
    name: "reasoning",
    description: "Directive: surface reasoning steps.",
    category: "model",
    tier: "power",
  },

  // Advanced
  {
    key: "elevated",
    name: "elevated",
    description: "Directive: request elevated permissions (gateway-controlled).",
    category: "advanced",
    tier: "power",
  },
  {
    key: "exec",
    name: "exec",
    description: "Directive: allow exec tool use (gateway-controlled).",
    category: "advanced",
    tier: "power",
  },
  {
    key: "queue",
    name: "queue",
    description: "Directive: queue the turn instead of running inline.",
    category: "advanced",
    tier: "power",
  },
];

/**
 * Filter commands by what the user has typed after the leading `/`.
 * Prefix match wins; substring is a fallback so `/cm` still finds /compact + /commands.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q || q === "/") return SLASH_COMMANDS;
  const stripped = q.startsWith("/") ? q.slice(1) : q;
  const exact = SLASH_COMMANDS.filter((c) => c.name.toLowerCase().startsWith(stripped));
  if (exact.length > 0) return exact;
  return SLASH_COMMANDS.filter((c) => c.name.toLowerCase().includes(stripped));
}

/**
 * Parse a chat message into { command, args } if it starts with a slash.
 * Returns null for plain (non-slash) messages.
 */
export function parseSlashMessage(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const space = trimmed.indexOf(" ");
  if (space === -1) {
    return { command: trimmed.slice(1), args: "" };
  }
  return { command: trimmed.slice(1, space), args: trimmed.slice(space + 1).trim() };
}

export function findCommand(name: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((c) => c.name === name);
}

// --- Local command actions ---

export type LocalSlashAction =
  | { kind: "clear" }
  | { kind: "new-session" }
  | { kind: "stop" }
  | { kind: "help"; content: string };

/**
 * Execute a slash command locally if it's marked executeLocal. Returns null
 * when the command should be sent to the agent verbatim.
 */
export function executeLocalSlashCommand(command: string): LocalSlashAction | null {
  const def = findCommand(command);
  if (!def?.executeLocal) return null;
  switch (command) {
    case "clear":
      return { kind: "clear" };
    case "new":
      return { kind: "new-session" };
    case "stop":
      return { kind: "stop" };
    case "help":
      return { kind: "help", content: renderHelp() };
    default:
      // executeLocal=true but no handler? Treat as pass-through.
      return null;
  }
}

function renderHelp(): string {
  const lines = ["**Available commands** (type `/` to open the menu):", ""];
  for (const c of SLASH_COMMANDS) {
    const args = c.args ? ` ${c.args}` : "";
    const local = c.executeLocal ? " · local" : " · sent to agent";
    lines.push(`• \`/${c.name}${args}\` — ${c.description}${local}`);
  }
  return lines.join("\n");
}
