"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import type { Project } from "@/types";
import { switchProjectAction } from "@/server/actions/projects";
import { projectHref, subPathFromPathname } from "@/lib/project-href";
import { toast } from "sonner";

type Props = {
  projects: Project[];
  activeSlug: string | null;
};

function initials(name: string): string {
  // Apple-style 1-2 character app-icon letterform. Prefer first letters
  // of two words; fall back to the first two characters.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function ProjectSwitcher({ projects, activeSlug }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const active = projects.find((p) => p.slug === activeSlug) ?? null;

  function pick(slug: string) {
    if (slug === activeSlug) return;
    const subPath = subPathFromPathname(pathname, activeSlug);
    start(async () => {
      const result = await switchProjectAction(slug);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(projectHref(slug, subPath));
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          className="h-9 gap-2 px-1.5 data-[state=open]:bg-sidebar-accent"
        >
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-md bg-[hsl(var(--notfair-accent-soft))] text-[10px] font-semibold tracking-tight text-[hsl(var(--notfair-accent))]"
          >
            {active ? initials(active.display_name) : "—"}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium tracking-tight">
            {active?.display_name ?? "No workspace"}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-64 rounded-xl p-1">
        <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {projects.length === 0 && (
          <DropdownMenuItem disabled className="text-xs">
            No workspaces yet
          </DropdownMenuItem>
        )}
        {projects.map((p) => {
          const isActive = p.slug === activeSlug;
          return (
            <DropdownMenuItem
              key={p.slug}
              onSelect={() => pick(p.slug)}
              disabled={pending}
              className="gap-2 rounded-md px-2 py-1.5"
            >
              <span
                aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-semibold tracking-tight ${
                  isActive
                    ? "bg-[hsl(var(--notfair-accent-soft))] text-[hsl(var(--notfair-accent))]"
                    : "bg-[hsl(var(--notfair-surface-2))] text-[hsl(var(--notfair-ink-2))]"
                }`}
              >
                {initials(p.display_name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {p.display_name}
              </span>
              {isActive && (
                <Check
                  className="size-3.5 text-[hsl(var(--notfair-accent))]"
                  aria-hidden
                />
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-md px-2 py-1.5">
          <a
            href="/onboarding"
            className="gap-2 text-[13px] font-medium text-[hsl(var(--notfair-accent))]"
          >
            <Plus className="size-3.5" />
            New workspace
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
