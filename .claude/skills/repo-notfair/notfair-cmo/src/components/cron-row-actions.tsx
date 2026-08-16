"use client";

import { useTransition } from "react";
import { MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { pauseCronAction, resumeCronAction, deleteCronAction } from "@/server/actions/crons";

type Props = {
  cronId: string;
  cronName: string;
  disabled: boolean;
};

export function CronRowActions({ cronId, cronName, disabled }: Props) {
  const [pending, start] = useTransition();

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? `Failed to ${label}`);
      else toast.success(`${label}: ${cronName}`);
    });
  }

  function confirmDelete() {
    if (typeof window !== "undefined" && !window.confirm(`Delete cron "${cronName}"?`)) return;
    run("Deleted", () => deleteCronAction(cronId));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={pending}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Cron actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {disabled ? (
          <DropdownMenuItem
            onSelect={() => run("Resumed", () => resumeCronAction(cronId))}
            disabled={pending}
          >
            <Play className="mr-2 size-3.5" />
            Resume
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() => run("Paused", () => pauseCronAction(cronId))}
            disabled={pending}
          >
            <Pause className="mr-2 size-3.5" />
            Pause
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={confirmDelete}
          disabled={pending}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
