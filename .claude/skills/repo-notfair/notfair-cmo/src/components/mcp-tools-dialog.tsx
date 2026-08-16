"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolSummary } from "@/server/mcp-server/tool-summaries";

/**
 * Tools modal for an MCP card.
 *
 * Two source modes:
 *   - `tools` prop is supplied (built-in / self-hosted MCP — server-rendered
 *     summary handed in directly, no network needed)
 *   - `loadTools` is supplied (external MCP — async server action invoked
 *     on first open, result cached)
 *
 * Layout is closer to an API-reference than a JSON dump: each tool gets
 * a monospace name, a one-line description, and a small grid of args
 * showing name (mono) · type · required-marker · arg description.
 * Search filters across tool name + arg names + description text.
 */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpName: string;
  /** Optional one-liner shown under the title — what the MCP does. */
  mcpDescription?: string;
  /** Eagerly-supplied tools (built-in MCP). Mutually exclusive with loadTools. */
  tools?: ToolSummary[];
  /** Lazy loader (external MCP). Called once on first open. */
  loadTools?: () => Promise<
    { ok: true; tools: ToolSummary[] } | { ok: false; error: string }
  >;
};

export function McpToolsDialog({
  open,
  onOpenChange,
  mcpName,
  mcpDescription,
  tools: eagerTools,
  loadTools,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lazyTools, setLazyTools] = useState<ToolSummary[] | null>(null);
  const [q, setQ] = useState("");

  // Lazy-load once on first open. Cache forever after — connecting +
  // disconnecting wouldn't change a tool list inside one session of the
  // modal being mounted, and the dialog unmounts on close anyway.
  useEffect(() => {
    if (!open) return;
    if (eagerTools) return;
    if (!loadTools) return;
    if (lazyTools !== null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadTools()
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setLazyTools(r.tools);
        else setError(r.error);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, eagerTools, loadTools, lazyTools]);

  const tools = eagerTools ?? lazyTools ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return tools;
    return tools.filter((t) => {
      if (t.name.toLowerCase().includes(needle)) return true;
      if (t.description.toLowerCase().includes(needle)) return true;
      return t.args.some(
        (a) =>
          a.name.toLowerCase().includes(needle) ||
          a.description.toLowerCase().includes(needle),
      );
    });
  }, [tools, q]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle className="flex items-baseline gap-2">
            <span>{mcpName}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {tools.length} {tools.length === 1 ? "tool" : "tools"}
            </span>
          </DialogTitle>
          {mcpDescription && (
            <DialogDescription className="text-xs">
              {mcpDescription}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Sticky search row — sits between header and scroll area. */}
        <div className="border-b bg-card px-6 py-2.5">
          <div className="relative">
            <Search
              aria-hidden
              className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${tools.length} tools…`}
              className="h-8 pl-8 text-xs"
              disabled={loading}
              aria-label="Search tools"
            />
          </div>
        </div>

        {/* Scroll area */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Fetching tool list…
            </div>
          )}
          {!loading && error && (
            <div className="px-6 py-12 text-center text-sm text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && tools.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              This MCP exposes no tools.
            </div>
          )}
          {!loading && !error && tools.length > 0 && filtered.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No tools match{" "}
              <span className="font-mono text-foreground">{q}</span>.
            </div>
          )}
          {!loading && !error && filtered.length > 0 && (
            <ul className="divide-y">
              {filtered.map((t) => (
                <ToolRow key={t.name} tool={t} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolRow({ tool }: { tool: ToolSummary }) {
  const requiredCount = tool.args.filter((a) => a.required).length;
  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
          {tool.name}
        </code>
        {tool.args.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {requiredCount}/{tool.args.length} required
          </span>
        )}
      </div>
      {tool.description && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {tool.description}
        </p>
      )}
      {tool.args.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {tool.args.map((a) => (
            <li
              key={a.name}
              className="grid grid-cols-[minmax(0,8rem)_minmax(0,7rem)_minmax(0,1fr)] items-baseline gap-x-3 text-[11px]"
            >
              <span className="truncate font-mono text-foreground">
                {a.name}
                {a.required && (
                  <span aria-label="required" className="ml-0.5 text-destructive">
                    *
                  </span>
                )}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "h-4 truncate px-1 font-mono text-[9px] font-normal",
                  // enums get a quieter slate-toned outline; primitives stay default
                  a.type.startsWith("enum:") && "border-dashed",
                )}
                title={a.type}
              >
                {a.type}
              </Badge>
              <span className="truncate text-muted-foreground" title={a.description}>
                {a.description || (
                  <span className="italic opacity-60">no description</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
