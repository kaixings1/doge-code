"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Plug, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { startMcpConnect } from "@/server/actions/mcp";
import type { McpRuntimeStatus } from "@/server/mcp/state";
import { projectHref } from "@/lib/project-href";

type Props = {
  status: McpRuntimeStatus;
  projectSlug: string;
};

/**
 * Shown above the chat for the Google Ads agent when the notfair-googleads
 * MCP isn't usable yet. The Connect button kicks off the same OAuth flow as
 * the Connections page, but threads the current chat URL through as
 * `return_to` so the user lands back here on success.
 */
export function GoogleAdsMcpBanner({ status, projectSlug }: Props) {
  const [busy, setBusy] = useState(false);

  if (status.state === "connected") return null;

  const isStale = status.state === "stale_token";
  const isUnreachable = status.state === "unreachable";

  async function onConnect() {
    setBusy(true);
    try {
      // Captured at click time (vs. via useSearchParams) so we don't pull in
      // a hook that would force a Suspense boundary in the page above us.
      const return_to = window.location.pathname + window.location.search;
      const result = await startMcpConnect({
        mcp_key: "notfair-googleads",
        return_to,
      });
      if (!result.ok) {
        toast.error(result.error);
        setBusy(false);
        return;
      }
      // Cross-origin redirect: leave the SPA and head to the issuer.
      window.location.href = result.authorize_url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const { headline, detail, action } = copyFor(status);

  return (
    <div
      className="border-b border-border/60 bg-[hsl(38_92%_97%)] px-6 py-3"
      role="status"
    >
      <div className="mx-auto flex w-full max-w-3xl items-start gap-3">
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] bg-[hsl(38_92%_92%)] text-[hsl(28_76%_38%)]">
          {isStale || isUnreachable ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Plug className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold tracking-tight text-[hsl(28_76%_28%)]">
            {headline}
          </div>
          <p className="mt-0.5 text-[12px] text-[hsl(28_55%_36%)]">
            {detail}{" "}
            <Link
              href={projectHref(projectSlug, "/connections")}
              className="underline underline-offset-2 hover:text-[hsl(28_76%_22%)]"
            >
              Manage connections
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className="ns-btn ns-btn-primary ns-btn-sm shrink-0"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plug className="size-3.5" />
          )}
          {action}
        </button>
      </div>
    </div>
  );
}

function copyFor(status: McpRuntimeStatus): {
  headline: string;
  detail: string;
  action: string;
} {
  switch (status.state) {
    case "stale_token":
      return {
        headline: "Google Ads connection expired",
        action: "Reconnect",
        detail:
          "The NotFair Google Ads token was rejected. Reconnect to resume live account operations.",
      };
    case "unreachable":
      return {
        headline: "Google Ads connection is unreachable",
        action: "Reconnect",
        detail:
          "Couldn't reach the NotFair Google Ads MCP. The agent will run blind until this is restored.",
      };
    case "configured_no_token":
      return {
        headline: "Google Ads MCP needs a token",
        action: "Connect",
        detail:
          "Connect to enable live campaign, keyword, bid, and budget operations against your account.",
      };
    case "not_configured":
    default:
      return {
        headline: "Connect NotFair Google Ads to go live",
        action: "Connect",
        detail:
          "Connect the MCP to let this agent run campaigns, manage keywords, and pull real metrics from your account.",
      };
  }
}
