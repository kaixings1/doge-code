"use client";

import { useApprovalsBadge } from "./live-counts-context";

/**
 * Live-updating approvals count badge. Reads from LiveCountsContext so
 * the number refreshes without re-rendering the parent server component.
 * Apple-styled: pill chip in brand-accent green, small and quiet.
 */
export function ApprovalsLiveBadge() {
  const count = useApprovalsBadge();
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} pending approval${count === 1 ? "" : "s"}`}
      className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[hsl(var(--notfair-accent))] px-1 text-[10px] font-semibold tabular-nums leading-none text-white"
    >
      {count}
    </span>
  );
}
