// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { startMcpConnect, toastFns } = vi.hoisted(() => ({
  startMcpConnect: vi.fn(),
  toastFns: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/server/actions/mcp", () => ({
  startMcpConnect: (...args: unknown[]) => startMcpConnect(...args),
}));

vi.mock("sonner", () => ({
  toast: toastFns,
}));

import { GoogleAdsMcpBanner } from "./google-ads-mcp-banner";
import type { McpRuntimeStatus } from "@/server/mcp/state";

const SLUG = "acme";

function setLocation(href: string) {
  const url = new URL(href);
  const fake = {
    pathname: url.pathname,
    search: url.search,
    href: url.href,
  } as Location;
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: fake,
  });
  return fake;
}

beforeEach(() => {
  startMcpConnect.mockReset();
  toastFns.success.mockReset();
  toastFns.error.mockReset();
  setLocation("http://localhost:3000/acme/agents/google_ads/chat?task=t1");
});

afterEach(() => {
  cleanup();
});

describe("GoogleAdsMcpBanner", () => {
  it("renders nothing when status is connected", () => {
    const { container } = render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{
          state: "connected",
          url: "https://x",
          tools_count: 5,
          last_checked_at: new Date().toISOString(),
        }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the 'connect' copy for not_configured status", () => {
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{ state: "not_configured" }}
      />,
    );
    expect(
      screen.getByText(/Connect NotFair Google Ads to go live/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Connect$/ })).toBeInTheDocument();
  });

  it("renders the 'reconnect' copy for stale_token status", () => {
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{
          state: "stale_token",
          url: "https://x",
          http_status: 401,
          last_checked_at: new Date().toISOString(),
        }}
      />,
    );
    expect(
      screen.getByText(/Google Ads connection expired/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reconnect/i })).toBeInTheDocument();
  });

  it("renders the 'unreachable' copy with reconnect action", () => {
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{
          state: "unreachable",
          url: "https://x",
          error: "ECONNRESET",
          last_checked_at: new Date().toISOString(),
        }}
      />,
    );
    expect(
      screen.getByText(/Google Ads connection is unreachable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reconnect/i })).toBeInTheDocument();
  });

  it("renders the 'configured_no_token' headline", () => {
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{ state: "configured_no_token", url: "https://x" }}
      />,
    );
    expect(
      screen.getByText(/Google Ads MCP needs a token/i),
    ).toBeInTheDocument();
  });

  it("links Manage connections to the project-scoped connections page", () => {
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{ state: "not_configured" }}
      />,
    );
    const link = screen.getByRole("link", { name: /Manage connections/i });
    expect(link).toHaveAttribute("href", `/${SLUG}/connections`);
  });

  it("posts the current URL as return_to and redirects on Connect success", async () => {
    startMcpConnect.mockResolvedValue({
      ok: true,
      authorize_url: "https://issuer.example/oauth?state=zzz",
    });
    const loc = setLocation(
      "http://localhost:3000/acme/agents/google_ads/chat?task=abc",
    );
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{ state: "not_configured" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
    await waitFor(() =>
      expect(startMcpConnect).toHaveBeenCalledWith({
        mcp_key: "notfair-googleads",
        return_to: "/acme/agents/google_ads/chat?task=abc",
      }),
    );
    await waitFor(() =>
      expect(loc.href).toBe("https://issuer.example/oauth?state=zzz"),
    );
  });

  it("toasts and re-enables the button when Connect returns ok=false", async () => {
    startMcpConnect.mockResolvedValue({ ok: false, error: "discovery failed" });
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{ state: "not_configured" }}
      />,
    );
    const button = screen.getByRole("button", { name: /^Connect$/ });
    fireEvent.click(button);
    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith("discovery failed"),
    );
    expect(button).not.toBeDisabled();
  });

  it("toasts the thrown error message when Connect throws", async () => {
    startMcpConnect.mockRejectedValue(new Error("boom"));
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{ state: "not_configured" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith("boom"));
  });

  it("disables the Connect button while a request is in flight", async () => {
    let resolve: (v: { ok: true; authorize_url: string }) => void = () => {};
    startMcpConnect.mockImplementation(
      () =>
        new Promise<{ ok: true; authorize_url: string }>((res) => {
          resolve = res;
        }),
    );
    render(
      <GoogleAdsMcpBanner
        projectSlug={SLUG}
        status={{ state: "not_configured" }}
      />,
    );
    const button = screen.getByRole("button", { name: /^Connect$/ });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    resolve({ ok: true, authorize_url: "https://issuer.example" });
  });
});
