"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
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
  getProjectDeletionSummaryAction,
  deleteProjectAction,
} from "@/server/actions/projects";
import type { ProjectDeletionSummary } from "@/server/agents/cascade-delete";

type Props = {
  projectSlug: string;
  projectName: string;
};

export function DangerZone({ projectSlug, projectName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ProjectDeletionSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setSummary(null);
      setSummaryError(null);
      return;
    }
    setLoadingSummary(true);
    (async () => {
      const r = await getProjectDeletionSummaryAction(projectSlug);
      if (r.ok) setSummary(r.data);
      else setSummaryError(r.error);
      setLoadingSummary(false);
    })();
  }, [open, projectSlug]);

  const canDelete = !pending && !loadingSummary;

  function onConfirm() {
    startTransition(async () => {
      const r = await deleteProjectAction(projectSlug, projectSlug);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      const partial = d.agentsFailed.length + d.cronsFailed;
      if (partial > 0) {
        toast.warning(
          `Deleted with ${partial} issue${partial === 1 ? "" : "s"}. ` +
            `${d.agents.length} agents, ${d.crons} crons removed.`,
        );
      } else {
        toast.success(
          `Deleted ${projectName}. ${d.agents.length} agents, ${d.crons} crons removed.`,
        );
      }
      setOpen(false);
      router.push("/");
      router.refresh();
    });
  }

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
              Delete this workspace
            </h3>
            <p className="mt-1 text-[12.5px] leading-snug text-[hsl(var(--notfair-ink-4))]">
              Removes all agents, every scheduled cron job, and every thread of
              chat history. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ns-btn ns-btn-danger ns-btn-sm shrink-0"
          >
            <Trash2 className="size-3.5" />
            Delete workspace
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" />
              Delete &ldquo;{projectName}&rdquo;?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the items below from notfair-cmo&apos;s
              local store. There is no recovery.
            </DialogDescription>
          </DialogHeader>

          {loadingSummary ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Counting what will be removed…
            </div>
          ) : summaryError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              Could not load deletion summary: {summaryError}
            </div>
          ) : summary ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 divide-x rounded-xl border border-border bg-card">
                <Stat label="Agents" value={summary.totals.agents} />
                <Stat label="Threads" value={summary.totals.threads} />
                <Stat label="Crons" value={summary.totals.crons} />
                <Stat label="MCPs" value={summary.totals.mcps} />
              </div>
              {summary.agents.some((a) => a.exists) && (
                <ul className="space-y-1 text-xs">
                  {summary.agents
                    .filter((a) => a.exists)
                    .map((a) => (
                      <li
                        key={a.agentId}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>
                          {a.display_name}{" "}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {a.agentId}
                          </span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {a.threadCount} thread{a.threadCount === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="text-[18px] font-semibold tabular-nums tracking-tight">
        {value}
      </div>
      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
