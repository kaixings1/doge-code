// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { toastFns } = vi.hoisted(() => ({
  toastFns: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: toastFns,
}));

import { ReprovisionButton } from "./reprovision-button";

beforeEach(() => {
  toastFns.success.mockReset();
  toastFns.error.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ReprovisionButton", () => {
  it("renders the idle label by default", () => {
    const action = vi.fn();
    render(<ReprovisionButton action={action} />);
    expect(
      screen.getByRole("button", { name: /reprovision agents/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/provisioning/i)).not.toBeInTheDocument();
  });

  it("toasts a success message when new agents are provisioned", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: true,
      created: ["cmo", "google_ads"],
      existed: [],
    });
    render(<ReprovisionButton action={action} />);
    fireEvent.click(screen.getByRole("button", { name: /reprovision agents/i }));
    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith("Provisioned 2 new agents."),
    );
    expect(toastFns.error).not.toHaveBeenCalled();
  });

  it("uses singular agent in success copy when exactly one is created", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: true,
      created: ["cmo"],
      existed: [],
    });
    render(<ReprovisionButton action={action} />);
    fireEvent.click(screen.getByRole("button", { name: /reprovision agents/i }));
    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith("Provisioned 1 new agent."),
    );
  });

  it("toasts a no-op message when all agents already exist", async () => {
    const action = vi.fn().mockResolvedValue({
      ok: true,
      created: [],
      existed: ["cmo", "google_ads"],
    });
    render(<ReprovisionButton action={action} />);
    fireEvent.click(screen.getByRole("button", { name: /reprovision agents/i }));
    await waitFor(() =>
      expect(toastFns.success).toHaveBeenCalledWith("All 2 agents already exist."),
    );
  });

  it("toasts the server error when action returns ok=false", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "openclaw exploded" });
    render(<ReprovisionButton action={action} />);
    fireEvent.click(screen.getByRole("button", { name: /reprovision agents/i }));
    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith("openclaw exploded"),
    );
    expect(toastFns.success).not.toHaveBeenCalled();
  });

  it("disables the button and swaps the label while the transition is pending", async () => {
    let resolveAction: (v: { ok: true; created: string[]; existed: string[] }) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<{ ok: true; created: string[]; existed: string[] }>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<ReprovisionButton action={action} />);
    const button = screen.getByRole("button", { name: /reprovision agents/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /provisioning/i }),
      ).toBeDisabled();
    });
    resolveAction({ ok: true, created: [], existed: [] });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /reprovision agents/i }),
      ).not.toBeDisabled(),
    );
  });
});
