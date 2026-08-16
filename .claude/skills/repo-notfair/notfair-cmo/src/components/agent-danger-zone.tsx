"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAgentDeletionSummaryAction,
  deleteAgentCascadeAction,
  type AgentDeletionSummary,
} from "@/server/actions/agents";

type Props = {
  agentId: string;
  agentDisplayName: string;
};

export function AgentDangerZone({ agentId, agentDisplayName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<AgentDeletionSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setSummary(null);
      setSummaryError(null);
      return;
    }
    setLoading(true);
    (async () => {
      const r = await getAgentDeletionSummaryAction(agentId);
      if (r.ok) setSummary(r.data);
      else setSummaryError(r.error);
      setLoading(false);
    })();
  }, [open, agentId]);

  function onConfirm() {
    startTransition(async () => {
      const r = await deleteAgentCascadeAction(agentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      if (d.crons_failed > 0) {
        toast.warning(
          `Deleted ${agentDisplayName}. ${d.crons_removed} crons removed, ${d.crons_failed} failed.`,
        );
      } else {
        toast.success(
          `Deleted ${agentDisplayName}. ${d.crons_removed} cron${d.crons_removed === 1 ? "" : "s"} removed.`,
        );
      }
      setOpen(false);
      router.push("/");
      router.refresh();
    });
  }

  function shortLabel(s: string): string {
    if (s === "main") return "Main thread";
    return s.length > 28 ? `${s.slice(0, 28)}…` : s;
  }

  function timeAgo(ms: number): string {
    if (!ms) return "new";
    const sec = Math.max(0, (Date.now() - ms) / 1000);
    if (sec < 60) return `${Math.floor(sec)}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }

  const canDelete = !pending && !loading;

  return (
    <>
      <div
        className="ns-card"
        style={{
          boxShadow:
            "inset 0 0 0 0.5px hsl(0 72% 51% / 0.25), 0 1px 2px rgba(0,0,0,.04)",
        }}
      >
        <div className="flex items-start gap-4 p-[18px]">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[hsl(0_92%_96%)] text-[hsl(0_72%_42%)]"
          >
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14.5px] font-semibold tracking-tight text-[hsl(0_72%_42%)]">
              Delete this agent
            </h3>
            <p className="mt-1 text-[12.5px] leading-snug text-[hsl(var(--notfair-ink-4))]">
              Removes the agent&rsquo;s workspace along with every chat thread
              and every scheduled job that targets it. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ns-btn ns-btn-danger ns-btn-sm shrink-0"
          >
            <Trash2 className="size-3.5" />
            Delete agent
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" />
              Delete &ldquo;{agentDisplayName}&rdquo;?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the items below from notfair-cmo&apos;s
              local store.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Counting what will be removed…
            </div>
          ) : summaryError ? (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {summaryError}
            </div>
          ) : summary ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Agent id</dt>
                <dd className="truncate font-mono">{summary.agent_id}</dd>

                {summary.template_key && (
                  <>
                    <dt className="text-muted-foreground">Template</dt>
                    <dd className="font-mono">{summary.template_key}</dd>
                  </>
                )}

                {summary.source_agent_id && (
                  <>
                    <dt className="text-muted-foreground">Cloned from</dt>
                    <dd className="font-mono">{summary.source_agent_id}</dd>
                  </>
                )}

                {!summary.exists_in_openclaw && (
                  <>
                    <dt className="text-muted-foreground">Workspace</dt>
                    <dd className="text-amber-600 dark:text-amber-400">
                      already removed
                    </dd>
                  </>
                )}
              </dl>

              <ItemList
                title={`Cron jobs (${summary.crons.length})`}
                emptyHint="No scheduled jobs target this agent."
              >
                {summary.crons.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="truncate font-mono text-[11px]">{c.name}</span>
                    {c.disabled && (
                      <span className="shrink-0 rounded border px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                        disabled
                      </span>
                    )}
                  </li>
                ))}
              </ItemList>

              <ItemList
                title={`Threads (${summary.threads.length})`}
                emptyHint="No chat threads yet."
              >
                {summary.threads.map((t) => (
                  <li key={t.session_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="truncate text-[11px]">{shortLabel(t.label)}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {timeAgo(t.last_interaction_at)}
                    </span>
                  </li>
                ))}
              </ItemList>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirm}
              disabled={!canDelete}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 size-3.5" />
                  Delete forever
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ItemList({
  title,
  emptyHint,
  children,
}: {
  title: string;
  emptyHint: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const empty = items.filter(Boolean).length === 0;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul className="max-h-40 divide-y overflow-y-auto rounded-md border bg-card text-xs">
        {empty ? (
          <li className="px-3 py-2 text-muted-foreground">{emptyHint}</li>
        ) : (
          children
        )}
      </ul>
    </div>
  );
}
