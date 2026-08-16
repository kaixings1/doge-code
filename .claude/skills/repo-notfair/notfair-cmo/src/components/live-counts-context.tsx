"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Client-side live counts for the sidebar. Replaces the previous
 * `router.refresh()`-driven badge updates — the sidebar's structure
 * never changes between polls, only the numbers do, so we keep the
 * server tree stable and just push fresh numbers through context.
 *
 * Stability is the whole point: when the polled response identical to
 * what's already in state, we DON'T call setState, so no descendant
 * re-renders. When the response differs, only the badge nodes that
 * read the new value actually update.
 */
export interface LiveCounts {
  /** Project slug the counts belong to. null when no active project. */
  project: string | null;
  /** Map of agent_id → in-flight task count. */
  agents: Record<string, number>;
  /** Project-level actionable approvals count. */
  approvals: number;
}

const LiveCountsContext = createContext<LiveCounts>({
  project: null,
  agents: {},
  approvals: 0,
});

export function useLiveCounts(): LiveCounts {
  return useContext(LiveCountsContext);
}

export function useInFlightCount(agentId: string): number {
  const { agents } = useLiveCounts();
  return agents[agentId] ?? 0;
}

export function useApprovalsBadge(): number {
  return useLiveCounts().approvals;
}

/**
 * Provider that owns the polling loop. Mounted high in the layout so
 * the sidebar + any other consumers (per-agent badges, future
 * dashboard cards) read fresh values without triggering a server
 * round-trip. Polling cadence: 2 s while any agent has in-flight work,
 * 8 s when idle (still useful for cron-driven kickoffs to surface
 * promptly without burning cycles).
 */
export function LiveCountsProvider({
  initial,
  children,
}: {
  initial: LiveCounts;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = useState<LiveCounts>(initial);
  const sigRef = useRef<string>(JSON.stringify(initial));
  const anyInFlight = Object.values(counts.agents).some((n) => n > 0);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await fetch("/api/in-flight-counts", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!r.ok || cancelled) return;
        const body = (await r.json()) as LiveCounts;
        // Canonical signature: same data → same string. Sort agent keys
        // so dictionary-iteration order doesn't create a false diff.
        const sig = JSON.stringify({
          p: body.project,
          a: Object.entries(body.agents)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, v]),
          v: body.approvals,
        });
        if (sigRef.current === sig) return;
        sigRef.current = sig;
        setCounts(body);
      } catch {
        // Network hiccup — skip this tick.
      }
    }

    // First tick on mount so server-rendered initial values catch up
    // if anything changed between layout-render and effect-fire.
    void tick();
    const interval = setInterval(tick, anyInFlight ? 2_000 : 8_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [anyInFlight]);

  // Stable context value: only changes when counts actually change.
  const value = useMemo(() => counts, [counts]);

  return (
    <LiveCountsContext.Provider value={value}>
      {children}
    </LiveCountsContext.Provider>
  );
}
