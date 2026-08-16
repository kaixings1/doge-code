"use client";

import { useState } from "react";
import { Workflow } from "lucide-react";

import { McpToolsDialog } from "@/components/mcp-tools-dialog";
import type { ToolSummary } from "@/server/mcp-server/tool-summaries";

/**
 * Row for an MCP that ships with notfair-cmo itself — no OAuth, no
 * connect/disconnect. Settings-row shaped to match McpCard. We drop
 * the "Built-in" pill because the section heading and the metadata
 * line ("self-hosted · 21 tools · no setup") already convey it; one
 * label is enough.
 */
type Props = {
  name: string;
  description: string;
  tools: ToolSummary[];
};

export function BuiltinMcpCard({ name, description, tools }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <article className="ns-row">
        <span className="ns-glyph ns-glyph-accent" aria-hidden>
          <Workflow className="size-[18px]" />
        </span>

        <div className="ns-row-body">
          <h3 className="ns-row-title">{name}</h3>
          <p className="ns-row-desc line-clamp-1">{description}</p>
          <p className="mt-1 truncate font-mono text-[10.5px] text-[hsl(var(--notfair-ink-4))]">
            self-hosted
            <span className="mx-1.5 opacity-50">·</span>
            {tools.length} tool{tools.length === 1 ? "" : "s"}
            <span className="mx-1.5 opacity-50">·</span>
            no setup
          </p>
        </div>

        <div className="ns-row-meta">
          <button
            type="button"
            className="ns-btn ns-btn-outline ns-btn-sm"
            onClick={() => setOpen(true)}
          >
            View tools
          </button>
        </div>
      </article>

      <McpToolsDialog
        open={open}
        onOpenChange={setOpen}
        mcpName={name}
        mcpDescription={description}
        tools={tools}
      />
    </>
  );
}
