"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { AgentTemplateKey } from "@/server/agent-templates";
import { colorForRole } from "@/lib/agent-colors";
import { cn } from "@/lib/utils";
import { projectHref } from "@/lib/project-href";
import { AgentAvatar } from "./agent-avatar";
import { useLiveCounts } from "./live-counts-context";

type AgentNavEntry = {
  /** Stable key for React, e.g. the agent_id. */
  key: string;
  slug: string;
  /** Personal name shown as the primary sidebar label (e.g. "Greg"). */
  name: string;
  /** Role label for the pill next to the name (e.g. "CMO"). Undefined for
   *  cloned/custom agents that aren't backed by a template. */
  role_label?: string;
  description?: string;
  /** Filled for template agents; undefined for cloned/custom ones. */
  template_key?: AgentTemplateKey;
};

type Props = {
  projectSlug: string;
  agents: AgentNavEntry[];
  /**
   * Optional server-side initial map (agent_id → in-flight count) used
   * for the first paint only. After mount, live values come from
   * LiveCountsContext so we don't re-render the parent server component
   * just to flip a number.
   */
  inFlightCounts?: Record<string, number>;
};

export function AgentNav({ projectSlug, agents, inFlightCounts = {} }: Props) {
  const pathname = usePathname();
  const live = useLiveCounts();
  const counts: Record<string, number> = { ...inFlightCounts, ...live.agents };

  return (
    <SidebarMenu>
      {agents.map((a) => {
        // Every agent lands on Chat by default — users start by talking to
        // the agent. Tasks tab (the audit/history view of filed work) is one
        // click away.
        const href = projectHref(projectSlug, `/agents/${a.slug}/chat`);
        const agentBase = `/${projectSlug}/agents/${a.slug}`;
        const isActive =
          pathname === agentBase || pathname?.startsWith(`${agentBase}/`);
        const liveCount = counts[a.key] ?? 0;
        const rolePalette = a.template_key ? colorForRole(a.template_key) : null;
        return (
          <SidebarMenuItem key={a.key}>
            <SidebarMenuButton asChild isActive={isActive}>
              <Link href={href}>
                {a.template_key ? (
                  <AgentAvatar role={a.template_key} size={20} />
                ) : (
                  <Bot />
                )}
                <span className="truncate">{a.name}</span>
                {a.role_label && rolePalette && (
                  <span
                    className={cn(
                      "ml-1 rounded-[4px] border px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-wide leading-none",
                      rolePalette.chip,
                    )}
                  >
                    {a.role_label}
                  </span>
                )}
                {liveCount > 0 && (
                  <span
                    className="ml-auto inline-flex items-center gap-1.5"
                    role="status"
                    aria-label={`${liveCount} running`}
                  >
                    <span aria-hidden className="ns-dot ns-dot-live" />
                    <span className="text-[10px] font-semibold tabular-nums text-[hsl(var(--notfair-accent))]">
                      {liveCount}
                    </span>
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
