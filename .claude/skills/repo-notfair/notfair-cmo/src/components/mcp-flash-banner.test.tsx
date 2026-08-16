// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const { routerReplace, toastFns } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  toastFns: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: toastFns,
}));

import { McpFlashBanner } from "./mcp-flash-banner";

function setLocation(href: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: new URL(href),
  });
}

beforeEach(() => {
  routerReplace.mockReset();
  toastFns.success.mockReset();
  toastFns.error.mockReset();
  setLocation(
    "http://localhost:3000/connections?mcp_connected=NotFair&other=keep",
  );
});

afterEach(() => {
  cleanup();
});

describe("McpFlashBanner", () => {
  it("renders nothing (returns null)", () => {
    const { container } = render(<McpFlashBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("toasts a success message and strips ?mcp_connected from the URL", async () => {
    render(<McpFlashBanner connected="NotFair Google Ads" />);
    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith(
        "Connected: NotFair Google Ads",
      ),
    );
    expect(routerReplace).toHaveBeenCalledWith("/connections?other=keep");
  });

  it("toasts an error and strips ?mcp_error when an error is provided", async () => {
    setLocation("http://localhost:3000/connections?mcp_error=boom&keep=1");
    render(<McpFlashBanner error="boom" />);
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith("boom"));
    expect(toastFns.success).not.toHaveBeenCalled();
    expect(routerReplace).toHaveBeenCalledWith("/connections?keep=1");
  });

  it("prefers the error toast when both connected and error are supplied", async () => {
    render(<McpFlashBanner connected="x" error="bad" />);
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith("bad"));
    expect(toastFns.success).not.toHaveBeenCalled();
  });

  it("does nothing when neither connected nor error is supplied", () => {
    render(<McpFlashBanner />);
    expect(toastFns.success).not.toHaveBeenCalled();
    expect(toastFns.error).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("returns a pathname-only URL when no query params remain after stripping", async () => {
    setLocation("http://localhost:3000/connections?mcp_connected=x");
    render(<McpFlashBanner connected="x" />);
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/connections"),
    );
  });
});
