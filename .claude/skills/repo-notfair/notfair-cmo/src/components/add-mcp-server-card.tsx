"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, BookOpenText, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { addUserMcpServerAction } from "@/server/actions/mcp";
import { BrowseConnectorsDialog } from "@/components/browse-connectors-dialog";

/**
 * "Add server" dropdown trigger for the Connections page header. Two
 * paths:
 *
 *  - **Browse connectors** → curated grid of trusted MCPs (Stripe,
 *    PostHog, NotFair, etc.). Click adds it to this project via the
 *    same OAuth probe + persistence path as a custom URL.
 *  - **Add custom connector** → paste-a-URL dialog for any OAuth 2.0
 *    MCP that publishes RFC 9728 discovery + DCR.
 *
 * No bearer-paste path: OAuth 2.0 only. The probe in
 * `addUserMcpServerAction` rejects servers that won't connect before
 * the user even sees a Connect button.
 */
export function AddMcpServerMenu({
  connectedKeys = [],
  connectedResourceUrls = [],
  hideKeys = [],
  trigger,
  align = "end",
}: {
  /** Catalog keys whose runtime status is `connected`. Browse tiles for
   *  these are filtered out of the grid entirely. */
  connectedKeys?: string[];
  /** Normalized resource URLs of connected entries — paired with
   *  `connectedKeys` so legacy rows (where the key was slugified
   *  differently than the trusted-connector id) still match by URL. */
  connectedResourceUrls?: string[];
  /** Browse-dialog `hideKeys` passthrough — exclude specific catalog
   *  entries from the grid (used by onboarding's connect step to hide
   *  the recommended trio that already has first-class tiles). */
  hideKeys?: string[];
  /** Optional custom trigger. When omitted, renders the default pill
   *  "Add server" button used by the Connections page header. Pass a
   *  custom button-shaped node when slotting this into a list row,
   *  grouped list, or other in-line surface. */
  trigger?: ReactNode;
  /** Radix `align` for the dropdown content. */
  align?: "start" | "center" | "end";
}) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <button type="button" className="ns-btn ns-btn-primary">
              <Plus className="size-3.5" />
              Add server
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-60">
          <DropdownMenuItem
            onSelect={() => setBrowseOpen(true)}
            className="gap-2 py-2.5"
          >
            <BookOpenText className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm">Browse connectors</span>
              <span className="text-[11px] text-muted-foreground">
                Stripe, PostHog, and more
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setCustomOpen(true)}
            className="gap-2 py-2.5"
          >
            <MoreHorizontal className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm">Add custom connector</span>
              <span className="text-[11px] text-muted-foreground">
                Paste an OAuth 2.0 MCP URL
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BrowseConnectorsDialog
        open={browseOpen}
        onOpenChange={setBrowseOpen}
        connectedKeys={connectedKeys}
        connectedResourceUrls={connectedResourceUrls}
        hideKeys={hideKeys}
      />
      <CustomConnectorDialog open={customOpen} onOpenChange={setCustomOpen} />
    </>
  );
}

function CustomConnectorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function reset() {
    setDisplayName("");
    setResourceUrl("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await addUserMcpServerAction({
        display_name: displayName,
        resource_url: resourceUrl,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        `Added MCP server '${result.key}'. Click Connect to authorize.`,
      );
      onOpenChange(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom connector</DialogTitle>
          <DialogDescription>
            Paste the MCP server&apos;s resource URL. We&apos;ll verify it
            advertises OAuth 2.0 dynamic client registration before saving.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-display-name">Name</Label>
            <Input
              id="mcp-display-name"
              placeholder="Stripe"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-resource-url">Remote MCP server URL</Label>
            <Input
              id="mcp-resource-url"
              type="url"
              placeholder="https://mcp.stripe.com/"
              value={resourceUrl}
              onChange={(e) => setResourceUrl(e.target.value)}
              disabled={submitting}
              required
            />
            <p className="text-xs text-muted-foreground">
              The HTTPS endpoint your agents will call. We derive the OAuth
              discovery URL from this automatically.
            </p>
          </div>
          {error ? (
            <p
              className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              Add server
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
