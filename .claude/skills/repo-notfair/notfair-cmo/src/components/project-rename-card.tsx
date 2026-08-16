"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import { renameProjectFullAction } from "@/server/actions/projects";

type Props = {
  currentSlug: string;
  currentDisplayName: string;
};

export function ProjectRenameCard({
  currentSlug,
  currentDisplayName,
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
      const r = await renameProjectFullAction({
        current_slug: currentSlug,
        new_display_name: trimmed,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      if (d.full_rename) {
        const failed = d.agents_failed.length;
        toast.success(
          failed > 0
            ? `Renamed to "${d.display_name}" (${d.agents_relocated.length} agents moved, ${failed} failed)`
            : `Renamed to "${d.display_name}" (${d.agents_relocated.length} agents moved)`,
        );
      } else {
        toast.success(`Renamed to "${d.display_name}"`);
      }
      router.refresh();
    });
  }

  const canSave =
    !pending && !slugError && trimmed.length > 0 && (nameChanged || slugChanged);

  return (
    <div className="ns-card">
      <div className="space-y-3 p-[18px]">
        <div>
          <h3 className="text-[14.5px] font-semibold tracking-tight text-[hsl(var(--notfair-ink))]">
            Rename this workspace
          </h3>
          <p className="mt-1 text-[12.5px] leading-snug text-[hsl(var(--notfair-ink-4))]">
            Changing the slug renames every agent, rewrites cron names, moves
            workspace dirs, and relocates session JSONL files.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="project-rename-name"
            className="text-[12px] font-medium text-[hsl(var(--notfair-ink-3))]"
          >
            Display name
          </Label>
          <input
            id="project-rename-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className={cn(
              "h-9 w-full rounded-lg border bg-background px-3 text-[13.5px] tracking-tight shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--notfair-accent-border))]",
              slugError && "border-destructive focus-visible:ring-destructive",
              pending && "opacity-50",
            )}
            aria-invalid={!!slugError}
          />
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
              . Every agent will be cloned to the new workspace and the old one
              removed.
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
              "Rename workspace"
            ) : (
              "Save name"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
