"use client";

import { useState, useTransition } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { scheduleCronAction } from "@/server/actions/crons";
import { toast } from "sonner";

type Specialist = "cmo" | "google_ads" | "seo";

const SPECIALIST_LABEL: Record<Specialist, string> = {
  cmo: "CMO",
  google_ads: "Google Ads",
  seo: "SEO",
};

type Props = {
  projectSlug: string;
  defaultSpecialist?: Specialist;
  variant?: "button" | "icon";
};

const PRESET_SCHEDULES: Array<{ label: string; value: string; tz?: string }> = [
  { label: "Every hour", value: "0 * * * *", tz: "America/Los_Angeles" },
  { label: "Every 15 minutes", value: "*/15 * * * *", tz: "America/Los_Angeles" },
  { label: "Daily at 9am (Los Angeles)", value: "0 9 * * *", tz: "America/Los_Angeles" },
  { label: "Weekdays at 8am (Los Angeles)", value: "0 8 * * 1-5", tz: "America/Los_Angeles" },
  { label: "Mondays at 6am (Los Angeles)", value: "0 6 * * 1", tz: "America/Los_Angeles" },
];

export function ScheduleCronDialog({ projectSlug, defaultSpecialist, variant = "button" }: Props) {
  const [open, setOpen] = useState(false);
  const [specialist, setSpecialist] = useState<Specialist>(defaultSpecialist ?? "google_ads");
  const [name, setName] = useState("");
  const [scheduleValue, setScheduleValue] = useState("0 9 * * *");
  const [tz, setTz] = useState("America/Los_Angeles");
  const [brief, setBrief] = useState("");
  const [pending, start] = useTransition();

  function reset() {
    setName("");
    setBrief("");
    setScheduleValue("0 9 * * *");
  }

  function pickPreset(p: (typeof PRESET_SCHEDULES)[number]) {
    setScheduleValue(p.value);
    if (p.tz) setTz(p.tz);
  }

  function submit() {
    start(async () => {
      const result = await scheduleCronAction({
        project_slug: projectSlug,
        specialist,
        name,
        schedule_kind: "cron",
        schedule_value: scheduleValue,
        tz,
        brief,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Scheduled ${result.cron_name}`);
      reset();
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            className="ns-btn ns-btn-outline ns-btn-sm"
          >
            <Plus className="size-4" />
            <span className="sr-only">Schedule recurring work</span>
          </button>
        ) : (
          <button type="button" className="ns-btn ns-btn-primary">
            <Plus className="size-4" />
            New cron
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule recurring work</DialogTitle>
          <DialogDescription>
            Creates a scheduled job under this workspace. The brief is the message the
            agent will receive on each tick.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="specialist">Agent</Label>
            <select
              id="specialist"
              value={specialist}
              onChange={(e) => setSpecialist(e.target.value as Specialist)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
              disabled={pending}
            >
              {(Object.keys(SPECIALIST_LABEL) as Specialist[]).map((s) => (
                <option key={s} value={s}>
                  {SPECIALIST_LABEL[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cron-name">Name</Label>
            <Input
              id="cron-name"
              placeholder="daily-bid-opt"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              maxLength={64}
            />
            <p className="text-[11px] text-muted-foreground">
              Kebab-case. Becomes the scheduled job's display name.
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="schedule">Schedule</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={pending}>
                    Presets <ChevronDown className="ml-1 size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {PRESET_SCHEDULES.map((p) => (
                    <DropdownMenuItem key={p.label} onSelect={() => pickPreset(p)}>
                      {p.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Input
              id="schedule"
              placeholder="0 9 * * *"
              value={scheduleValue}
              onChange={(e) => setScheduleValue(e.target.value)}
              disabled={pending}
              className="font-mono text-sm"
            />
            <Input
              placeholder="Timezone (IANA)"
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              disabled={pending}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="brief">Brief</Label>
            <textarea
              id="brief"
              placeholder="RUN: review yesterday's campaign performance and propose bid adjustments."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              disabled={pending}
              rows={3}
              className="min-h-[80px] resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim() || !brief.trim()}>
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {pending ? "Scheduling..." : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
