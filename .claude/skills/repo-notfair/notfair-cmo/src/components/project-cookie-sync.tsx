"use client";

import { useEffect, useRef } from "react";
import { switchProjectAction } from "@/server/actions/projects";

/**
 * Keeps the legacy `notfair_active_project` cookie in lockstep with the URL
 * project slug. The cookie is still consulted by the sidebar (mounted higher
 * up in the tree than the `[project]` dynamic segment) and the API routes,
 * so when a user deep-links into `/<other-slug>/...` we need the cookie to
 * flip over to that slug. Fires at most once per slug change per mount.
 */
export function ProjectCookieSync({ slug }: { slug: string }) {
  const lastSlug = useRef<string | null>(null);

  useEffect(() => {
    if (lastSlug.current === slug) return;
    lastSlug.current = slug;
    // Server action — sets the cookie and revalidates layout cache so the
    // sidebar's `activeSlug` matches the URL on next render.
    void switchProjectAction(slug);
  }, [slug]);

  return null;
}
