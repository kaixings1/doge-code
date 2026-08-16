// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { RunningDot } from "./running-dot";

afterEach(() => cleanup());

describe("RunningDot", () => {
  it("renders a status role with the default 'Running' aria-label", () => {
    render(<RunningDot />);
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveAccessibleName("Running");
  });

  it("uses the small sizing class by default", () => {
    render(<RunningDot />);
    const status = screen.getByRole("status");
    expect(status.className).toMatch(/\bh-2\b/);
    expect(status.className).toMatch(/\bw-2\b/);
    expect(status.className).not.toMatch(/h-2\.5/);
  });

  it("uses the larger sizing class when size='md'", () => {
    render(<RunningDot size="md" />);
    const status = screen.getByRole("status");
    expect(status.className).toMatch(/h-2\.5/);
    expect(status.className).toMatch(/w-2\.5/);
  });

  it("forwards a caller-supplied className alongside the size classes", () => {
    render(<RunningDot className="extra-thing" />);
    const status = screen.getByRole("status");
    expect(status.className).toMatch(/extra-thing/);
    expect(status.className).toMatch(/inline-flex/);
  });

  it("overrides the aria-label when one is supplied", () => {
    render(<RunningDot aria-label="Task in flight" />);
    expect(screen.getByRole("status")).toHaveAccessibleName("Task in flight");
  });

  it("includes the pulsing ping layer underneath the solid dot", () => {
    const { container } = render(<RunningDot />);
    const inner = container.querySelectorAll("span span");
    expect(inner.length).toBe(2);
    const [ping, solid] = inner;
    expect(ping.className).toMatch(/animate-ping/);
    expect(ping.className).toMatch(/bg-sky-400/);
    expect(solid.className).toMatch(/bg-sky-500/);
  });
});
