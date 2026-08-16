"use client";

import { useEffect, useState } from "react";

/**
 * Render children only AFTER the client has mounted. The server renders an empty
 * shell, the client mounts and swaps in real content. Eliminates every class of
 * hydration mismatch in the wrapped tree (cookie-state divergence, lazy Radix
 * event handlers, browser-extension HTML mutations, etc.) at the cost of an
 * extra paint and zero SSR for the wrapped region.
 *
 * V1 trade-off: the app shell isn't on the SEO/perf critical path; the chat
 * itself is what matters, and that's already client-driven. Silencing the
 * hydration noise is worth the deferred mount.
 */
export function ClientMountGate({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
