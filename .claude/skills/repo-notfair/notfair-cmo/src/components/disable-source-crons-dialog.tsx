"use client";

import { useState, useTransition } from "react";
import { Loader2, Pause } from "lucide-react";
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
import { disableCronsAction } from "@/server/actions/agents";
import type { CloneSourceCron } from "@/server/agents/clone";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLabel: string;
  newAgentId: string;
  sourceCrons: CloneSourceCron[];
  onDone: () => void;
};

export function DisableSourceCronsDialog({
  open,
  onOpenChange,
  sourceLabel,
  newAgentId,
  sourceCrons,
  onDone,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);

  const enabledSource = sourceCrons.filter((c) => !c.disabled);

  function disableAll() {
    if (enabledSource.length === 0) {
      finish();
      return;
    }
    startTransition(async () => {
      const r = await disableCronsAction(enabledSource.map((c) => c.id));
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.failed > 0) {
        toast.warning(`Disabled ${r.data.disabled} crons (${r.data.failed} failed)`);
      } else {
        toast.success(`Disabled ${r.data.disabled} cron${r.data.disabled === 1 ? "" : "s"} on ${sourceLabel}`);
      }
      setCompleted(true);
      finish();
    });
  }

  function keepRunning() {
    finish();
  }

  function finish() {
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Disable {sourceLabel}&rsquo;s cron jobs?</DialogTitle>
          <DialogDescription>
            We just copied {sourceCrons.length} cron job
            {sourceCrons.length === 1 ? "" : "s"} from <span className="font-mono text-xs">{sourceLabel}</span>{" "}
            onto your new agent <span className="font-mono text-xs">{newAgentId}</span>. Leaving the originals
            running will fire both copies on schedule.
          </DialogDescription>
        </DialogHeader>

        {sourceCrons.length > 0 && (
          <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border bg-card p-2 text-xs">
            {sourceCrons.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="truncate">{c.name}</span>
                {c.disabled && (
                  <span className="shrink-0 rounded border px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    already off
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={keepRunning} disabled={pending}>
            Keep them running
          </Button>
          <Button type="button" onClick={disableAll} disabled={pending || completed}>
            {pending ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Disabling…
              </>
            ) : (
              <>
                <Pause className="mr-1.5 size-3.5" />
                Disable on source (recommended)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
