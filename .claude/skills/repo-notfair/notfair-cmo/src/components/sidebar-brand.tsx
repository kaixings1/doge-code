"use client";

import Link from "next/link";
import { PanelLeft } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

type Props = {
  /** Where the brand link points when the sidebar is expanded. */
  homeHref: string;
};

/**
 * Brand mark in the sidebar header. Dual-purpose:
 *
 *  - **Expanded:** a Link to the workspace home, anchoring the rail with
 *    Notfair identity. A separate SidebarTrigger collapses the rail.
 *  - **Collapsed:** becomes the expand toggle itself — clicking the mark
 *    re-opens the sidebar, and the small panel icon overlays on hover to
 *    signal the action. Saves a row of chrome in the icon rail.
 */
export function SidebarBrand({ homeHref }: Props) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Expand sidebar"
        title="Expand sidebar"
        className="group/brand relative flex h-8 w-full shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[hsl(var(--notfair-surface-2))]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/notfair-mark.svg"
          alt="Notfair"
          className="h-[18px] w-auto transition-opacity group-hover/brand:opacity-0"
        />
        <PanelLeft
          aria-hidden
          className="absolute size-4 text-[hsl(var(--notfair-ink-3))] opacity-0 transition-opacity group-hover/brand:opacity-100"
        />
      </button>
    );
  }

  return (
    <Link
      href={homeHref}
      aria-label="Notfair CMO home"
      className="flex h-8 shrink-0 items-center px-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/notfair-mark.svg" alt="Notfair" className="h-[18px] w-auto" />
    </Link>
  );
}
