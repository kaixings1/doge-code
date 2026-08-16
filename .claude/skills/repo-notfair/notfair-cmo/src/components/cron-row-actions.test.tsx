// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Radix DropdownMenu / Dialog depend on a few DOM APIs jsdom doesn't ship.
// Polyfill them on Element so Radix can mount and respond to pointer events.
if (typeof Element !== "undefined") {
  // @ts-expect-error - jsdom shim
  Element.prototype.hasPointerCapture ??= () => false;
  // @ts-expect-error - jsdom shim
  Element.prototype.setPointerCapture ??= () => {};
  // @ts-expect-error - jsdom shim
  Element.prototype.releasePointerCapture ??= () => {};
  // @ts-expect-error - jsdom shim
  Element.prototype.scrollIntoView ??= () => {};
}

const pauseCronAction = vi.fn();
const resumeCronAction = vi.fn();
const deleteCronAction = vi.fn();

const toast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock("@/server/actions/crons", () => ({
  pauseCronAction: (...args: unknown[]) => pauseCronAction(...args),
  resumeCronAction: (...args: unknown[]) => resumeCronAction(...args),
  deleteCronAction: (...args: unknown[]) => deleteCronAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
  },
}));

import { CronRowActions } from "./cron-row-actions";

function openMenu() {
  const trigger = screen.getByRole("button", { name: /cron actions/i });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
}

beforeEach(() => {
  pauseCronAction.mockReset();
  resumeCronAction.mockReset();
  deleteCronAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("CronRowActions", () => {
  it("shows a 'Pause' menu item when the cron is enabled", () => {
    render(<CronRowActions cronId="c1" cronName="daily-bid-opt" disabled={false} />);
    openMenu();
    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });

  it("shows a 'Resume' menu item when the cron is disabled", () => {
    render(<CronRowActions cronId="c1" cronName="daily-bid-opt" disabled={true} />);
    openMenu();
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.queryByText("Pause")).not.toBeInTheDocument();
  });

  it("calls pauseCronAction and toasts success when Pause is clicked", async () => {
    pauseCronAction.mockResolvedValue({ ok: true });
    render(<CronRowActions cronId="c-pause" cronName="hourly-sweep" disabled={false} />);
    openMenu();
    fireEvent.click(screen.getByText("Pause"));
    await waitFor(() => expect(pauseCronAction).toHaveBeenCalledWith("c-pause"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Paused: hourly-sweep"));
  });

  it("calls resumeCronAction and toasts success when Resume is clicked", async () => {
    resumeCronAction.mockResolvedValue({ ok: true });
    render(<CronRowActions cronId="c-resume" cronName="weekly-roundup" disabled={true} />);
    openMenu();
    fireEvent.click(screen.getByText("Resume"));
    await waitFor(() => expect(resumeCronAction).toHaveBeenCalledWith("c-resume"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Resumed: weekly-roundup"));
  });

  it("toasts the server error when pause fails", async () => {
    pauseCronAction.mockResolvedValue({ ok: false, error: "openclaw exploded" });
    render(<CronRowActions cronId="c1" cronName="x" disabled={false} />);
    openMenu();
    fireEvent.click(screen.getByText("Pause"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("openclaw exploded"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("falls back to a generic error when the action returns ok=false without a message", async () => {
    resumeCronAction.mockResolvedValue({ ok: false });
    render(<CronRowActions cronId="c1" cronName="x" disabled={true} />);
    openMenu();
    fireEvent.click(screen.getByText("Resume"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to Resumed"));
  });

  it("deletes when the user confirms the prompt", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteCronAction.mockResolvedValue({ ok: true });
    render(<CronRowActions cronId="c-del" cronName="goner" disabled={false} />);
    openMenu();
    fireEvent.click(screen.getByText("Delete"));
    expect(confirmSpy).toHaveBeenCalledWith('Delete cron "goner"?');
    await waitFor(() => expect(deleteCronAction).toHaveBeenCalledWith("c-del"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Deleted: goner"));
    confirmSpy.mockRestore();
  });

  it("does not call deleteCronAction when the user cancels the confirm prompt", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CronRowActions cronId="c-del" cronName="lucky" disabled={false} />);
    openMenu();
    fireEvent.click(screen.getByText("Delete"));
    expect(deleteCronAction).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
