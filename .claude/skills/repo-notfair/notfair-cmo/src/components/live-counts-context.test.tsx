/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  LiveCountsProvider,
  useApprovalsBadge,
  useInFlightCount,
  type LiveCounts,
} from "./live-counts-context";

function Probe({ agentId }: { agentId: string }) {
  const approvals = useApprovalsBadge();
  const inFlight = useInFlightCount(agentId);
  return (
    <div>
      <span data-testid="approvals">{approvals}</span>
      <span data-testid="inflight">{inFlight}</span>
    </div>
  );
}

const initial: LiveCounts = {
  project: "demo1",
  agents: { "demo1-cmo": 0, "demo1-google-ads": 1 },
  approvals: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiveCountsProvider", () => {
  it("renders initial server-side counts on first paint", () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(initial), { status: 200 }),
    );
    render(
      <LiveCountsProvider initial={initial}>
        <Probe agentId="demo1-google-ads" />
      </LiveCountsProvider>,
    );
    expect(screen.getByTestId("approvals").textContent).toBe("0");
    expect(screen.getByTestId("inflight").textContent).toBe("1");
  });

  it("updates badges when the polled response differs", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          project: "demo1",
          agents: { "demo1-google-ads": 3 },
          approvals: 5,
        }),
        { status: 200 },
      ),
    );
    render(
      <LiveCountsProvider initial={initial}>
        <Probe agentId="demo1-google-ads" />
      </LiveCountsProvider>,
    );
    // Initial paint shows the server-side initial values.
    expect(screen.getByTestId("inflight").textContent).toBe("1");
    expect(screen.getByTestId("approvals").textContent).toBe("0");
    // The provider's useEffect fires an immediate `tick()` on mount;
    // wait for the resulting setState to flush through.
    await waitFor(() => {
      expect(screen.getByTestId("approvals").textContent).toBe("5");
      expect(screen.getByTestId("inflight").textContent).toBe("3");
    });
  });

  it("does not re-render children when the polled signature is identical", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(initial), { status: 200 }),
    );
    let renders = 0;
    function Counter() {
      renders++;
      const c = useInFlightCount("demo1-google-ads");
      return <span data-testid="c">{c}</span>;
    }
    render(
      <LiveCountsProvider initial={initial}>
        <Counter />
      </LiveCountsProvider>,
    );
    // Give the immediate tick + any state updates a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    const baseline = renders;
    // Another wait. Multiple ticks happen because vitest doesn't run the
    // interval, but the immediate tick already returned identical data —
    // so the provider should NOT have called setState, and Counter
    // should not have re-rendered beyond the initial mount.
    await new Promise((r) => setTimeout(r, 50));
    expect(renders).toBe(baseline);
    expect(screen.getByTestId("c").textContent).toBe("1");
  });
});
