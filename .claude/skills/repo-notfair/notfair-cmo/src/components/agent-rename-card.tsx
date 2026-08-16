"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import { projectHref } from "@/lib/project-href";
import { renameAgentAction } from "@/server/actions/agents";

type Props = {
  agentId: string;
  projectSlug: string;
  currentDisplayName: string;
  currentSlug: string;
};

export function AgentRenameCard({
  agentId,
  projectSlug,
  currentDisplayName,
  currentSlug,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(currentDisplayName);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setName(currentDisplayName);
  }, [currentDisplayName]);

  const trimmed = name.trim();
  const slugAttempt = trimmed ? slugify(trimmed) : null;
  const derivedSlug = slugAttempt?.ok ? slugAttempt.slug : null;
  const slugError = slugAttempt && !slugAttempt.ok ? slugAttempt.reason : null;
  const slugChanged = !!derivedSlug && derivedSlug !== currentSlug;
  const nameChanged = trimmed !== currentDisplayName;

  function save() {
    if (!nameChanged && !slugChanged) return;
    startTransition(async () => {
      const r = await renameAgentAction({
        agent_id: agentId,
        new_display_name: trimmed,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      toast.success(
        d.full_rename
          ? `Renamed to "${d.display_name}" (new URL: ${projectHref(projectSlug, `/agents/${d.slug}`)})`
          : `Renamed to "${d.display_name}"`,
      );
      if (d.full_rename) {
        // agent_id and URL slug changed — route to the new settings page.
        router.push(projectHref(projectSlug, `/agents/${d.slug}/settings`));
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  const canSave =
    !pending && !slugError && trimmed.length > 0 && (nameChanged || slugChanged);

  return (
    <div className="ns-card">
      <div className="space-y-3 p-[18px]">
        <div>
          <h3 className="text-[14.5px] font-semibold tracking-tight text-[hsl(var(--notfair-ink))]">
            Rename this agent
          </h3>
          <p className="mt-1 text-[12.5px] leading-snug text-[hsl(var(--notfair-ink-4))]">
            Changing the slug rewrites the URL, workspace path, sessions
            location, and every cron name. Chat history and prompts come along.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="rename-display-name"
            className="text-[12px] font-medium text-[hsl(var(--notfair-ink-3))]"
          >
            Display name
          </Label>
          <div
            className={cn(
              "flex h-9 items-stretch overflow-hidden rounded-lg border bg-background text-sm shadow-sm focus-within:ring-2 focus-within:ring-[hsl(var(--notfair-accent-border))]",
              slugError && "border-destructive focus-within:ring-destructive",
              pending && "opacity-50",
            )}
          >
            <span
              className="flex select-none items-center border-r bg-[hsl(var(--notfair-surface-2))] px-3 font-mono text-[12px] text-[hsl(var(--notfair-ink-4))]"
              aria-hidden
            >
              {projectSlug}-
            </span>
            <input
              id="rename-display-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="flex-1 bg-transparent px-3 font-mono text-[13px] placeholder:text-muted-foreground/60 focus-visible:outline-none disabled:cursor-not-allowed"
              placeholder={currentSlug}
              aria-invalid={!!slugError}
            />
          </div>
          {slugError ? (
            <p className="text-[11.5px] text-destructive">
              Invalid name: {slugError}
            </p>
          ) : slugChanged ? (
            <p className="text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
              Slug changes from{" "}
              <code className="rounded bg-[hsl(var(--notfair-surface-2))] px-1.5 py-px font-mono text-[11px]">
                {currentSlug}
              </code>{" "}
              to{" "}
              <code className="rounded bg-[hsl(var(--notfair-accent-soft))] px-1.5 py-px font-mono text-[11px] text-[hsl(var(--notfair-accent))]">
                {derivedSlug}
              </code>
              . Full rename: clones into the new id, then deletes the old.
            </p>
          ) : (
            <p className="text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
              Same slug — only the display name changes.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="ns-btn ns-btn-primary ns-btn-sm"
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {slugChanged ? "Renaming…" : "Saving…"}
              </>
            ) : slugChanged ? (
              "Rename agent"
            ) : (
              "Save name"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
