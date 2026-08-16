"use client";

import { useState } from "react";
import { Plug } from "lucide-react";

/**
 * Brand favicon for an MCP server, fetched via Google's `faviconV2`
 * service. Subdomain-aware: `mcp.stripe.com` resolves to `stripe.com`
 * so we get the company brand mark, not the API-subdomain glyph (which
 * usually isn't indexed).
 *
 * Falls back to the `Plug` lucide icon on malformed input or image
 * load failure.
 */
export function McpIcon({
  resourceUrl,
  alt,
  size = "md",
}: {
  resourceUrl: string;
  alt: string;
  size?: "md" | "lg";
}) {
  const [errored, setErrored] = useState(false);
  let host: string | null = null;
  try {
    host = new URL(resourceUrl).hostname;
  } catch {
    host = null;
  }
  const brandHost = host ? brandDomain(host) : null;
  const showImg = !!brandHost && !errored;
  const boxClass = size === "lg" ? "size-10" : "size-9";
  const imgClass = size === "lg" ? "size-6" : "size-5";
  const fallbackClass = size === "lg" ? "size-5" : "size-4";
  return (
    <div
      className={`flex ${boxClass} shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted`}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${brandHost}&size=32`}
          alt={alt}
          width={32}
          height={32}
          className={imgClass}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : (
        <Plug className={fallbackClass} />
      )}
    </div>
  );
}

/**
 * Reduce a hostname to its registrable brand domain
 * (`mcp.stripe.com` → `stripe.com`). Simple last-2-labels heuristic;
 * wrong for `.co.uk` and friends, but right for ~all consumer SaaS the
 * connections page targets, and `faviconV2`'s `fallback_opts` cushions
 * the rest.
 */
export function brandDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}
