"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * One-shot banner driven by the `?mcp_connected` / `?mcp_error` query
 * params the OAuth callback redirects with. Fires the toast once on mount
 * and strips the params so a refresh doesn't re-toast.
 */
export function McpFlashBanner({
  connected,
  error,
}: {
  connected?: string;
  error?: string;
}) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!connected && !error) return;
    fired.current = true;
    if (error) toast.error(error);
    else if (connected) toast.success(`Connected: ${connected}`);
    // Clean the URL so a refresh / back-button doesn't re-fire.
    const url = new URL(window.location.href);
    url.searchParams.delete("mcp_connected");
    url.searchParams.delete("mcp_error");
    router.replace(url.pathname + (url.search ? url.search : ""));
  }, [connected, error, router]);

  return null;
}
