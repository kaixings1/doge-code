"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectHref } from "@/lib/project-href";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SessionOriginLite =
  | { kind: "task"; display_id: string; title: string | null }
  | { kind: "cron"; cron_name: string }
  | { kind: "chat"; preview: string };

export type SessionLite = {
  sessionId: string;
  label: string;
  sessionKey: string;
  lastInteractionAt: number;
  pending: boolean;
  /**
   * Server-classified origin. Drives the dropdown row label so users see
   * a task display id, cron name, or chat preview instead of a raw UUID.
   * Undefined for pending threads (no transcript / task / cron yet).
   */
  origin?: SessionOriginLite;
};

type Props = {
  projectSlug: string;
  agentSlug: string;
  sessions: SessionLite[];
  activeSessionId: string;
};

function timeAgo(ms: number) {
  if (!ms) return "new";
  const seconds = Math.max(0, (Date.now() - ms) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function formatTaskTitle(o: { display_id: string; title: string | null }): string {
  const id = o.display_id.toUpperCase();
  return o.title ? truncate(`${id} ${o.title}`) : id;
}

function displayTitle(s: SessionLite): string {
  if (s.pending) return `New thread · ${s.sessionId.slice(0, 8)}`;
  if (s.origin?.kind === "task") return formatTaskTitle(s.origin);
  if (s.origin?.kind === "cron") return truncate(s.origin.cron_name);
  if (s.origin?.kind === "chat" && s.origin.preview) {
    return truncate(s.origin.preview);
  }
  if (s.label === "main") return "Main thread";
  return truncate(s.label, 32);
}

type SectionKey = "tasks" | "crons" | "chats";

const SECTION_ORDER: SectionKey[] = ["tasks", "crons", "chats"];
const SECTION_TITLES: Record<SectionKey, string> = {
  tasks: "Tasks",
  crons: "Crons",
  chats: "Chats",
};

function sectionFor(s: SessionLite): SectionKey {
  if (s.origin?.kind === "task") return "tasks";
  if (s.origin?.kind === "cron") return "crons";
  // Pending threads + classified chats + unclassified fallbacks all go under
  // "Chats" so the dropdown never strands a row in an unlabeled section.
  return "chats";
}

function groupBySection(sessions: SessionLite[]): Map<SectionKey, SessionLite[]> {
  const groups = new Map<SectionKey, SessionLite[]>();
  for (const s of sessions) {
    const key = sectionFor(s);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  return groups;
}

export function ThreadSelector({
  projectSlug,
  agentSlug,
  sessions,
  activeSessionId,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = sessions.find((s) => s.sessionId === activeSessionId);

  function go(sessionId: string) {
    if (sessionId === activeSessionId) return;
    start(() =>
      router.push(projectHref(projectSlug, `/agents/${agentSlug}/chat/${sessionId}`)),
    );
  }

  function newThread() {
    const id = crypto.randomUUID();
    start(() =>
      router.push(projectHref(projectSlug, `/agents/${agentSlug}/chat/${id}`)),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-w-[200px] justify-between"
          disabled={pending}
        >
          <span className="truncate text-left">
            {active ? displayTitle(active) : "Pick a thread"}
          </span>
          <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Threads ({sessions.length}) · from OpenClaw
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sessions.length === 0 && (
          <DropdownMenuItem disabled>No threads yet</DropdownMenuItem>
        )}
        {(() => {
          const groups = groupBySection(sessions);
          const present = SECTION_ORDER.filter((k) => (groups.get(k)?.length ?? 0) > 0);
          return present.map((key, idx) => {
            const rows = groups.get(key)!;
            return (
              <div key={key}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {SECTION_TITLES[key]} ({rows.length})
                </DropdownMenuLabel>
                {rows.map((s) => {
                  const isActive = s.sessionId === activeSessionId;
                  return (
                    <DropdownMenuItem
                      key={s.sessionId}
                      onSelect={(e) => {
                        e.preventDefault();
                        go(s.sessionId);
                      }}
                      className="flex items-center gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{displayTitle(s)}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {s.sessionId.slice(0, 8)} · {timeAgo(s.lastInteractionAt)}
                        </div>
                      </div>
                      {isActive && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
                    </DropdownMenuItem>
                  );
                })}
              </div>
            );
          });
        })()}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            newThread();
          }}
          disabled={pending}
        >
          <Plus className="mr-2 size-3.5" />
          New thread
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
