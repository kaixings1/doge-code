// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import { ClientMountGate } from "./client-mount-gate";

afterEach(() => cleanup());

describe("ClientMountGate", () => {
  it("renders the fallback during SSR (no useEffect has fired yet)", () => {
    const html = renderToString(
      <ClientMountGate fallback={<span>loading skeleton</span>}>
        <span>real content</span>
      </ClientMountGate>,
    );
    expect(html).toContain("loading skeleton");
    expect(html).not.toContain("real content");
  });

  it("renders an empty shell during SSR when no fallback is supplied", () => {
    const html = renderToString(
      <ClientMountGate>
        <span>real content</span>
      </ClientMountGate>,
    );
    expect(html).not.toContain("real content");
    expect(html.replace(/<!--.*?-->/g, "")).toBe("");
  });

  it("swaps the fallback for the children after the client mounts", () => {
    render(
      <ClientMountGate fallback={<span data-testid="fallback">loading…</span>}>
        <span data-testid="content">real content</span>
      </ClientMountGate>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("renders children even with no fallback once mounted", () => {
    render(
      <ClientMountGate>
        <span data-testid="content">visible</span>
      </ClientMountGate>,
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("remains rendering children across re-renders", () => {
    const { rerender } = render(
      <ClientMountGate>
        <span data-testid="content">first</span>
      </ClientMountGate>,
    );
    expect(screen.getByTestId("content").textContent).toBe("first");
    act(() => {
      rerender(
        <ClientMountGate>
          <span data-testid="content">second</span>
        </ClientMountGate>,
      );
    });
    expect(screen.getByTestId("content").textContent).toBe("second");
  });
});
