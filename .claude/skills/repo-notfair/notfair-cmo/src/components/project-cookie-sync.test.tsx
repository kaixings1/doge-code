// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const switchProjectAction = vi.fn();

vi.mock("@/server/actions/projects", () => ({
  switchProjectAction: (...args: unknown[]) => switchProjectAction(...args),
}));

import { ProjectCookieSync } from "./project-cookie-sync";

beforeEach(() => {
  switchProjectAction.mockReset();
  switchProjectAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

describe("ProjectCookieSync", () => {
  it("calls switchProjectAction with the slug on first mount", () => {
    render(<ProjectCookieSync slug="alpha" />);
    expect(switchProjectAction).toHaveBeenCalledTimes(1);
    expect(switchProjectAction).toHaveBeenCalledWith("alpha");
  });

  it("renders nothing visible", () => {
    const { container } = render(<ProjectCookieSync slug="alpha" />);
    expect(container.firstChild).toBeNull();
  });

  it("does not re-fire when the same slug is re-rendered", () => {
    const { rerender } = render(<ProjectCookieSync slug="alpha" />);
    expect(switchProjectAction).toHaveBeenCalledTimes(1);
    rerender(<ProjectCookieSync slug="alpha" />);
    expect(switchProjectAction).toHaveBeenCalledTimes(1);
  });

  it("fires again when the slug changes", () => {
    const { rerender } = render(<ProjectCookieSync slug="alpha" />);
    rerender(<ProjectCookieSync slug="beta" />);
    expect(switchProjectAction).toHaveBeenCalledTimes(2);
    expect(switchProjectAction).toHaveBeenLastCalledWith("beta");
  });
});
