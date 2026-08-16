"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  addUserMcpServerAction,
  startMcpConnect,
} from "@/server/actions/mcp";
import {
  TRUSTED_CONNECTORS,
  type TrustedConnector,
} from "@/server/trusted-connectors";
import { McpIcon } from "@/components/mcp-icon";
import { normalizeResourceUrl } from "@/server/mcp/discovery-url";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Catalog keys whose runtime status is `connected`. */
  connectedKeys?: string[];
  /** Normalized resource URLs of connected entries — used to detect
   *  legacy rows whose key doesn't match the trusted-connector id. */
  connectedResourceUrls?: string[];
  /**
   * Catalog keys to exclude entirely from the grid. Used by the
   * onboarding connect step, which surfaces the three recommended
   * MCPs (Google Ads, Meta Ads, GSC) as first-class tiles and only
   * uses this dialog for the "More" overflow. Without this filter the
   * dialog would render duplicates of the tiles the user already sees.
   */
  hideKeys?: string[];
};

/**
 * Two-column grid of trusted MCP connectors that aren't yet connected for
 * this project. Clicking a tile is a one-shot setup:
 * `addUserMcpServerAction` writes the row (idempotent — re-clicking a
 * stale row is fine), then `startMcpConnect` is fired immediately and the
 * browser is redirected to the issuer's authorize URL.
 *
 * Already-connected connectors are filtered out entirely (rather than
 * rendered greyed-out) so the dialog only ever surfaces actionable
 * options. When every available connector is already wired, the dialog
 * shows an empty-state message.
 */
export function BrowseConnectorsDialog({
  open,
  onOpenChange,
  connectedKeys = [],
  connectedResourceUrls = [],
  hideKeys = [],
}: Props) {
  const connectedKeySet = new Set(connectedKeys);
  const connectedUrlSet = new Set(connectedResourceUrls);
  const hideKeySet = new Set(hideKeys);
  const availableConnectors = TRUSTED_CONNECTORS.filter((c) => {
    if (hideKeySet.has(c.id)) return false;
    if (connectedKeySet.has(c.id)) return false;
    if (connectedUrlSet.has(normalizeResourceUrl(c.resource_url))) return false;
    return true;
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Browse connectors</DialogTitle>
          <DialogDescription>
            Pick a trusted MCP server. We&apos;ll add it and start the OAuth
            flow in one step.
          </DialogDescription>
        </DialogHeader>
        {availableConnectors.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            All available connectors are already connected.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableConnectors.map((c) => (
              <ConnectorTile
                key={c.id}
                connector={c}
                onAdded={() => onOpenChange(false)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectorTile({
  connector,
  onAdded,
}: {
  connector: TrustedConnector;
  onAdded: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const busy = adding || pending;

  function onPick() {
    setAdding(true);
    startTransition(async () => {
      const addResult = await addUserMcpServerAction({
        display_name: connector.display_name,
        resource_url: connector.resource_url,
        // Force the canonical preset/connector key so adding "NotFair
        // Google Ads" hits the preset (`notfair-googleads`) rather than
        // slugifying into a different identifier.
        key: connector.id,
      });
      if (!addResult.ok) {
        toast.error(addResult.error);
        setAdding(false);
        return;
      }
      // Chain straight into OAuth so the user only clicks once. The
      // upcoming full-page redirect is the visible feedback — we
      // intentionally don't toast a separate "added" success.
      //
      // Pass `return_to` so the OAuth callback lands the user back on
      // the connections page they started from. Without it the callback
      // falls back to `/`, which bounces to the active project's home.
      const return_to = window.location.pathname + window.location.search;
      const connectResult = await startMcpConnect({
        mcp_key: addResult.key,
        return_to,
      });
      if (!connectResult.ok) {
        toast.error(
          `Added ${connector.display_name}, but couldn't start OAuth: ${connectResult.error}`,
        );
        router.refresh();
        onAdded();
        setAdding(false);
        return;
      }
      // Full-page navigation: the authorize URL is on the issuer's
      // origin, so we can't push() into Next's router.
      window.location.href = connectResult.authorize_url;
    });
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <McpIcon
        resourceUrl={connector.resource_url}
        alt={connector.display_name}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{connector.display_name}</p>
          {busy ? (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {connector.description}
        </p>
      </div>
    </button>
  );
}
