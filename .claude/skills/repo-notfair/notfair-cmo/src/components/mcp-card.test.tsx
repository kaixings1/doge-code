// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { startMcpConnect, disconnectMcpAction, routerRefresh, toastFns } = vi.hoisted(() => ({
  startMcpConnect: vi.fn(),
  disconnectMcpAction: vi.fn(),
  routerRefresh: vi.fn(),
  toastFns: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/server/actions/mcp", () => ({
  startMcpConnect: (...args: unknown[]) => startMcpConnect(...args),
  disconnectMcpAction: (...args: unknown[]) => disconnectMcpAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: routerRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: toastFns,
}));

import { McpCard } from "./mcp-card";
import type { McpSpec } from "@/server/mcp-catalog";
import type { McpRuntimeStatus } from "@/server/mcp/state";

const spec: McpSpec = {
  key: "notfair-googleads",
  display_name: "NotFair Google Ads",
  description: "Live Google Ads operations.",
  resource_url: "https://notfair.co/api/mcp/google_ads",
  discovery_url:
    "https://notfair.co/.well-known/oauth-protected-resource/api/mcp/google_ads",
  source: "preset",
};

function connected(overrides: Partial<Extract<McpRuntimeStatus, { state: "connected" }>> = {}): McpRuntimeStatus {
  return {
    state: "connected",
    url: "https://notfair.co/api/mcp/google_ads",
    tools_count: 12,
    last_checked_at: new Date().toISOString(),
    ...overrides,
  };
}

function setLocationHref() {
  const original = window.location;
  const fake = { ...original, href: "" } as Location & { href: string };
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: fake,
  });
  return fake;
}

beforeEach(() => {
  startMcpConnect.mockReset();
  disconnectMcpAction.mockReset();
  routerRefresh.mockReset();
  toastFns.success.mockReset();
  toastFns.error.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("McpCard", () => {
  it("shows spec metadata (name, description, host)", () => {
    render(<McpCard spec={spec} status={{ state: "not_configured" }} />);
    expect(screen.getByText(spec.display_name)).toBeInTheDocument();
    expect(screen.getByText(spec.description)).toBeInTheDocument();
    // The row shows the resource URL's host, not the full URL.
    expect(screen.getByText("notfair.co")).toBeInTheDocument();
  });

  it("renders a 'connected' indicator and just the host when connected", () => {
    render(<McpCard spec={spec} status={connected({ tools_count: null })} />);
    expect(screen.getByText("connected")).toBeInTheDocument();
    // The "connected" tag carries the live signal; the status line shows
    // only the host so the row doesn't repeat itself.
    expect(screen.getByText("notfair.co")).toBeInTheDocument();
    expect(screen.queryByText(/verified/)).not.toBeInTheDocument();
  });

  it("shows a Disconnect button when connected and a Connect button otherwise", () => {
    const { rerender } = render(
      <McpCard spec={spec} status={connected()} />,
    );
    expect(
      screen.getByRole("button", { name: /disconnect/i }),
    ).toBeInTheDocument();
    rerender(<McpCard spec={spec} status={{ state: "not_configured" }} />);
    expect(
      screen.getByRole("button", { name: /^connect$/i }),
    ).toBeInTheDocument();
  });

  it("labels the action button 'Reconnect' on stale_token", () => {
    render(
      <McpCard
        spec={spec}
        status={{
          state: "stale_token",
          url: "https://x",
          http_status: 401,
          last_checked_at: new Date().toISOString(),
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /reconnect/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/token expired/i)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 401/)).toBeInTheDocument();
  });

  it("renders the unreachable status with the underlying error", () => {
    render(
      <McpCard
        spec={spec}
        status={{
          state: "unreachable",
          url: "https://x",
          error: "ECONNREFUSED",
          last_checked_at: new Date().toISOString(),
        }}
      />,
    );
    expect(screen.getByText(/unreachable/i)).toBeInTheDocument();
    expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument();
  });

  it("renders the configured_no_token status with helper text", () => {
    render(
      <McpCard
        spec={spec}
        status={{ state: "configured_no_token", url: "https://x" }}
      />,
    );
    expect(screen.getByText(/no token/i)).toBeInTheDocument();
    expect(
      screen.getByText(/config saved, awaiting bearer/i),
    ).toBeInTheDocument();
  });

  it("redirects the browser to authorize_url when Connect succeeds", async () => {
    const loc = setLocationHref();
    startMcpConnect.mockResolvedValue({
      ok: true,
      authorize_url: "https://issuer.example/oauth?state=abc",
    });
    render(<McpCard spec={spec} status={{ state: "not_configured" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() =>
      expect(startMcpConnect).toHaveBeenCalledWith({
        mcp_key: spec.key,
        return_to: "/",
      }),
    );
    await waitFor(() =>
      expect(loc.href).toBe("https://issuer.example/oauth?state=abc"),
    );
    expect(toastFns.error).not.toHaveBeenCalled();
  });

  it("toasts and stays on-page when Connect returns ok=false", async () => {
    startMcpConnect.mockResolvedValue({ ok: false, error: "discovery failed" });
    render(<McpCard spec={spec} status={{ state: "not_configured" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith("discovery failed"),
    );
    // Button is re-enabled.
    expect(screen.getByRole("button", { name: /^connect$/i })).not.toBeDisabled();
  });

  it("toasts the thrown error message when Connect throws", async () => {
    startMcpConnect.mockRejectedValue(new Error("network down"));
    render(<McpCard spec={spec} status={{ state: "not_configured" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^connect$/i }));
    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith("network down"),
    );
  });

  it("disconnects, toasts success, and refreshes the router", async () => {
    disconnectMcpAction.mockResolvedValue({ ok: true });
    render(<McpCard spec={spec} status={connected()} />);
    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    await waitFor(() =>
      expect(disconnectMcpAction).toHaveBeenCalledWith({ mcp_key: spec.key }),
    );
    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith(
        `${spec.display_name} disconnected`,
      ),
    );
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("toasts the error and skips router.refresh when Disconnect returns ok=false", async () => {
    disconnectMcpAction.mockResolvedValue({
      ok: false,
      error: "openclaw permission denied",
    });
    render(<McpCard spec={spec} status={connected()} />);
    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith("openclaw permission denied"),
    );
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("disables the Connect button while the connect call is in flight", async () => {
    setLocationHref();
    let resolve: (v: { ok: true; authorize_url: string }) => void = () => {};
    startMcpConnect.mockImplementation(
      () =>
        new Promise<{ ok: true; authorize_url: string }>((res) => {
          resolve = res;
        }),
    );
    render(<McpCard spec={spec} status={{ state: "not_configured" }} />);
    const button = screen.getByRole("button", { name: /^connect$/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    resolve({ ok: true, authorize_url: "https://issuer.example" });
  });
});
