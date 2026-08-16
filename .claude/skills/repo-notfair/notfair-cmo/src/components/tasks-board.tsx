"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Columns3,
  LayoutGrid,
  List as ListIcon,
  Users,
  X,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/project-href";
import type { ProjectAgentEntry } from "@/server/agent-meta";
import type { Task, TaskStatus } from "@/types";

/**
 * /tasks board.
 *
 * Server hands us the full task list + the project's agent roster; this
 * component owns all interaction state — filters, visible status columns,
 * kanban-vs-list perspective — and persists them to localStorage keyed by
 * project slug so each project can have its own layout.
 *
 * Status columns: we show every column the user has enabled (default
 * "working / blocked / done", since those are what's interesting day-to-
 * day). Empty enabled columns still render as placeholders so the layout
 * doesn't jitter as cards move; columns the user disabled simply do not
 * appear in the kanban.
 *
 * Filters: agent multi-select (chips in the toolbar). An empty filter
 * means "all agents". Filter applies in both perspectives.
 *
 * Perspective: kanban (default) is the standard horizontal column layout;
 * list is a compact table-like view sorted by updated_at desc — useful
 * when the user wants a single sorted feed instead of per-column groups.
 */

type Perspective = "kanban" | "list";

type Prefs = {
  columns: TaskStatus[];
  view: Perspective;
  agents: string[]; // agent_ids, empty = show all
};

const STATUS_ORDER: TaskStatus[] = [
  "proposed",
  "approved",
  "working",
  "blocked",
  "done",
  "failed",
  "cancelled",
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  working: "Working",
  blocked: "Blocked",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

// Small color cues per status. Kept muted — the dot is a 6px circle the
// eye picks up at a glance; the column header still wears it as a thin
// left border so the kanban reads at a glance.
const STATUS_TONE: Record<TaskStatus, string> = {
  proposed: "bg-zinc-400",
  approved: "bg-sky-500",
  working: "bg-amber-500",
  blocked: "bg-rose-500",
  done: "bg-emerald-500",
  failed: "bg-red-700",
  cancelled: "bg-zinc-300",
};

const DEFAULT_PREFS: Prefs = {
  columns: ["working", "blocked", "done"],
  view: "kanban",
  agents: [],
};

function prefsKey(projectSlug: string): string {
  return `notfair-cmo:tasks-prefs:${projectSlug}`;
}

function loadPrefs(projectSlug: string): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(prefsKey(projectSlug));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      columns:
        Array.isArray(parsed.columns) && parsed.columns.every(isStatus)
          ? parsed.columns
          : DEFAULT_PREFS.columns,
      view: parsed.view === "list" ? "list" : "kanban",
      agents: Array.isArray(parsed.agents)
        ? parsed.agents.filter((a): a is string => typeof a === "string")
        : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function isStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && STATUS_ORDER.includes(v as TaskStatus);
}

type Props = {
  projectSlug: string;
  tasks: Task[];
  agents: ProjectAgentEntry[];
};

export function TasksBoard({ projectSlug, tasks, agents }: Props) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // Hydrate from localStorage after mount — server render uses defaults
  // so SSR + first paint stay stable. The brief flash from default →
  // restored prefs is acceptable for an internal dashboard.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setPrefs(loadPrefs(projectSlug));
    setHydrated(true);
  }, [projectSlug]);
  // Persist on any change after hydration.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(prefsKey(projectSlug), JSON.stringify(prefs));
    } catch {
      // Storage full / disabled — fall through, the UI still works.
    }
  }, [hydrated, projectSlug, prefs]);

  const agentById = useMemo(() => {
    const m = new Map<string, ProjectAgentEntry>();
    for (const a of agents) m.set(a.agent_id, a);
    return m;
  }, [agents]);

  // Apply agent filter (empty = all).
  const filteredTasks = useMemo(() => {
    if (prefs.agents.length === 0) return tasks;
    const set = new Set(prefs.agents);
    return tasks.filter((t) => set.has(t.agent_id));
  }, [tasks, prefs.agents]);

  const counts = useMemo(() => {
    const out: Partial<Record<TaskStatus, number>> = {};
    for (const t of filteredTasks) {
      out[t.status] = (out[t.status] ?? 0) + 1;
    }
    return out;
  }, [filteredTasks]);

  const visibleColumns = STATUS_ORDER.filter((s) => prefs.columns.includes(s));

  // ── Toolbar handlers ────────────────────────────────────────────────
  function toggleColumn(s: TaskStatus) {
    setPrefs((p) =>
      p.columns.includes(s)
        ? { ...p, columns: p.columns.filter((x) => x !== s) }
        : { ...p, columns: [...p.columns, s] },
    );
  }
  function resetColumns() {
    setPrefs((p) => ({ ...p, columns: DEFAULT_PREFS.columns }));
  }
  function toggleAgent(agentId: string) {
    setPrefs((p) =>
      p.agents.includes(agentId)
        ? { ...p, agents: p.agents.filter((a) => a !== agentId) }
        : { ...p, agents: [...p.agents, agentId] },
    );
  }
  function clearAgents() {
    setPrefs((p) => ({ ...p, agents: [] }));
  }
  function setView(view: Perspective) {
    setPrefs((p) => ({ ...p, view }));
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        {/* Agent filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ns-btn ns-btn-outline ns-btn-sm"
            >
              <Users className="size-3.5" />
              {prefs.agents.length === 0
                ? "All agents"
                : prefs.agents.length === 1
                  ? agentLabel(agentById, prefs.agents[0])
                  : `${prefs.agents.length} agents`}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground uppercase tracking-wide">
              Filter by agent
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {agents.map((a) => {
              const active = prefs.agents.includes(a.agent_id);
              return (
                <DropdownMenuItem
                  key={a.agent_id}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleAgent(a.agent_id);
                  }}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {active && <Check className="size-2.5" />}
                  </span>
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {countForAgent(filteredTasks, tasks, a.agent_id)}
                  </span>
                </DropdownMenuItem>
              );
            })}
            {prefs.agents.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    clearAgents();
                  }}
                  className="text-xs text-muted-foreground"
                >
                  Clear filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ns-btn ns-btn-outline ns-btn-sm"
            >
              <Columns3 className="size-3.5" />
              {prefs.columns.length} columns
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground uppercase tracking-wide">
              Visible columns
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_ORDER.map((s) => {
              const active = prefs.columns.includes(s);
              return (
                <DropdownMenuItem
                  key={s}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleColumn(s);
                  }}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-muted-foreground/40",
                    )}
                  >
                    {active && <Check className="size-2.5" />}
                  </span>
                  <span
                    aria-hidden
                    className={cn("size-1.5 rounded-full", STATUS_TONE[s])}
                  />
                  <span>{STATUS_LABEL[s]}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground tabular-nums">
                    {counts[s] ?? 0}
                  </span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                resetColumns();
              }}
              className="text-xs text-muted-foreground"
            >
              Reset to defaults
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="ml-auto inline-flex overflow-hidden rounded-full border border-border bg-card p-0.5"
          style={{ boxShadow: "var(--notfair-shadow-sm)" }}
        >
          <button
            type="button"
            aria-label="Kanban view"
            aria-pressed={prefs.view === "kanban"}
            onClick={() => setView("kanban")}
            className={cn(
              "flex h-7 w-9 items-center justify-center rounded-full transition-colors",
              prefs.view === "kanban"
                ? "bg-[hsl(var(--notfair-ink))] text-white"
                : "text-[hsl(var(--notfair-ink-4))] hover:text-[hsl(var(--notfair-ink))]",
            )}
          >
            <LayoutGrid className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={prefs.view === "list"}
            onClick={() => setView("list")}
            className={cn(
              "flex h-7 w-9 items-center justify-center rounded-full transition-colors",
              prefs.view === "list"
                ? "bg-[hsl(var(--notfair-ink))] text-white"
                : "text-[hsl(var(--notfair-ink-4))] hover:text-[hsl(var(--notfair-ink))]",
            )}
          >
            <ListIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Active-filter chips (only show when non-default) */}
      {prefs.agents.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Filtered by
          </span>
          {prefs.agents.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleAgent(id)}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] hover:bg-muted"
            >
              {agentLabel(agentById, id)}
              <X className="size-2.5 opacity-60" />
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {tasks.length === 0 ? (
        <div className="ns-empty">
          <p className="ns-empty-title">No tasks yet.</p>
          <p className="ns-empty-sub">
            Ask your CMO to do something in chat to populate this board.
          </p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="ns-empty">
          <p className="ns-empty-title">No tasks match the current filter.</p>
          <button
            type="button"
            onClick={clearAgents}
            className="ns-btn ns-btn-ghost ns-btn-sm mt-3"
          >
            Clear filter
          </button>
        </div>
      ) : prefs.view === "kanban" ? (
        <KanbanView
          projectSlug={projectSlug}
          tasks={filteredTasks}
          visibleColumns={visibleColumns}
          counts={counts}
          agentById={agentById}
        />
      ) : (
        <ListView
          projectSlug={projectSlug}
          tasks={filteredTasks}
          agentById={agentById}
          enabledStatuses={new Set(prefs.columns)}
        />
      )}
    </div>
  );
}

// ── Kanban ────────────────────────────────────────────────────────────

function KanbanView({
  projectSlug,
  tasks,
  visibleColumns,
  counts,
  agentById,
}: {
  projectSlug: string;
  tasks: Task[];
  visibleColumns: TaskStatus[];
  counts: Partial<Record<TaskStatus, number>>;
  agentById: Map<string, ProjectAgentEntry>;
}) {
  if (visibleColumns.length === 0) {
    return (
      <div className="ns-empty">
        <p className="ns-empty-title">No columns selected.</p>
        <p className="ns-empty-sub">
          Open the Columns menu and pick at least one status to display.
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {visibleColumns.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <section
            key={status}
            className="flex w-72 shrink-0 flex-col rounded-[14px] bg-[hsl(var(--notfair-surface-2))]/60"
            style={{ boxShadow: "inset 0 0 0 0.5px hsl(var(--border))" }}
            aria-label={`${STATUS_LABEL[status]} column`}
          >
            <header className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", STATUS_TONE[status])}
                />
                <h2 className="text-[12px] font-semibold tracking-tight text-[hsl(var(--notfair-ink-2))]">
                  {STATUS_LABEL[status]}
                </h2>
              </div>
              <span className="font-mono text-[10.5px] tabular-nums text-[hsl(var(--notfair-ink-4))]">
                {counts[status] ?? 0}
              </span>
            </header>
            <div className="min-h-[120px] flex-1 space-y-2 p-2">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-[hsl(var(--notfair-ink-4))]/70">
                  No tasks.
                </p>
              ) : (
                items.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    projectSlug={projectSlug}
                    assignee={agentById.get(t.agent_id)?.name ?? t.agent_id}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  projectSlug,
  assignee,
}: {
  task: Task;
  projectSlug: string;
  assignee: string;
}) {
  return (
    <Link
      href={projectHref(projectSlug, `/tasks/${task.id}`)}
      className="block rounded-[10px] bg-card p-3 transition-colors hover:bg-[hsl(0_0%_99%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--notfair-accent-border))]"
      style={{ boxShadow: "var(--notfair-shadow-sm)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tabular-nums text-[hsl(var(--notfair-ink-4))]">
          {task.display_id.toUpperCase()}
        </span>
        <span className="text-[10px] text-[hsl(var(--notfair-ink-4))]">
          {relativeTime(task.updated_at)}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] font-medium text-[hsl(var(--notfair-ink))]">
        {task.title ?? task.brief}
      </p>
      {task.title && (
        <p className="mt-0.5 line-clamp-2 text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
          {task.brief}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="ns-tag">{assignee}</span>
      </div>
    </Link>
  );
}

// ── List view ─────────────────────────────────────────────────────────

function ListView({
  projectSlug,
  tasks,
  agentById,
  enabledStatuses,
}: {
  projectSlug: string;
  tasks: Task[];
  agentById: Map<string, ProjectAgentEntry>;
  enabledStatuses: Set<TaskStatus>;
}) {
  // In list view we still honor the column-visibility prefs (treating
  // them as "which statuses to include"), but we sort newest-first by
  // updated_at across all of them — no grouping. This is the
  // "everything I care about, by recency" feed.
  const rows = useMemo(
    () =>
      tasks
        .filter((t) => enabledStatuses.has(t.status))
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() -
            new Date(a.updated_at).getTime(),
        ),
    [tasks, enabledStatuses],
  );

  if (rows.length === 0) {
    return (
      <div className="ns-empty">
        <p className="ns-empty-title">No tasks in the selected statuses.</p>
        <p className="ns-empty-sub">
          Open the Columns menu to include more.
        </p>
      </div>
    );
  }
  return (
    <div
      className="overflow-hidden rounded-[14px] bg-card"
      style={{ boxShadow: "var(--notfair-shadow)" }}
    >
      <div className="grid grid-cols-[6rem_7rem_minmax(0,1fr)_9rem_6rem] gap-3 border-b border-border/60 bg-[hsl(var(--notfair-surface-2))]/40 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-[hsl(var(--notfair-ink-4))]">
        <span>ID</span>
        <span>Status</span>
        <span>Description</span>
        <span>Assignee</span>
        <span className="text-right">Updated</span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={projectHref(projectSlug, `/tasks/${t.id}`)}
              className="grid grid-cols-[6rem_7rem_minmax(0,1fr)_9rem_6rem] items-center gap-3 px-4 py-2.5 text-[12.5px] transition-colors hover:bg-[hsl(0_0%_99%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--notfair-accent-border))]"
            >
              <span className="truncate font-mono text-[11px] tabular-nums text-[hsl(var(--notfair-ink-4))]">
                {t.display_id.toUpperCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    STATUS_TONE[t.status],
                  )}
                />
                <span className="text-[11.5px] text-[hsl(var(--notfair-ink-3))]">
                  {STATUS_LABEL[t.status]}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-[hsl(var(--notfair-ink))]">
                  {t.title ?? t.brief}
                </span>
                {t.title && (
                  <span className="block truncate text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
                    {t.brief}
                  </span>
                )}
              </span>
              <span className="truncate text-[hsl(var(--notfair-ink-4))]">
                {agentById.get(t.agent_id)?.name ?? t.agent_id}
              </span>
              <span className="truncate text-right text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
                {relativeTime(t.updated_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function agentLabel(
  agentById: Map<string, ProjectAgentEntry>,
  agentId: string,
): string {
  return agentById.get(agentId)?.name ?? agentId;
}

function countForAgent(
  filtered: Task[],
  all: Task[],
  agentId: string,
): number {
  // Show the count of *all* tasks for this agent in the dropdown so
  // users see the total they'd see if they picked this agent, not the
  // (potentially zero) count after the current filter is applied.
  void filtered;
  return all.filter((t) => t.agent_id === agentId).length;
}

function statusBorderTone(status: TaskStatus): string {
  switch (status) {
    case "working":
      return "border-l-amber-500";
    case "blocked":
      return "border-l-rose-500";
    case "done":
      return "border-l-emerald-500";
    case "approved":
      return "border-l-sky-500";
    case "failed":
      return "border-l-red-700";
    case "cancelled":
      return "border-l-zinc-300";
    case "proposed":
    default:
      return "border-l-zinc-400";
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}
