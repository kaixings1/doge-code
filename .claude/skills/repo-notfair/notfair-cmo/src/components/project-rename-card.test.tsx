// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const router = {
  push: vi.fn(),
  refresh: vi.fn(),
};
const renameProjectFullAction = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/server/actions/projects", () => ({
  renameProjectFullAction: (...args: unknown[]) => renameProjectFullAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
  },
}));

import { ProjectRenameCard } from "./project-rename-card";

beforeEach(() => {
  router.refresh.mockReset();
  router.push.mockReset();
  renameProjectFullAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ProjectRenameCard", () => {
  it("seeds the input with the current display name", () => {
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue("Alpha");
  });

  it("disables Save when name is unchanged", () => {
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    expect(screen.getByRole("button", { name: /save name/i })).toBeDisabled();
  });

  it("flips the button to 'Rename workspace' when the slug changes", () => {
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Bravo" } });
    expect(
      screen.getByRole("button", { name: /rename workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/slug changes from/i)).toBeInTheDocument();
  });

  it("shows invalid-name error and disables save on bad input", () => {
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "@@@" } });
    expect(screen.getByText(/invalid name/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save name|rename workspace/i }),
    ).toBeDisabled();
  });

  it("calls renameProjectFullAction and toasts on partial-success (failures present)", async () => {
    renameProjectFullAction.mockResolvedValue({
      ok: true,
      data: {
        full_rename: true,
        display_name: "Bravo",
        agents_relocated: ["a", "b"],
        agents_failed: ["c"],
      },
    });
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Bravo" } });
    fireEvent.click(screen.getByRole("button", { name: /rename workspace/i }));
    await waitFor(() =>
      expect(renameProjectFullAction).toHaveBeenCalledWith({
        current_slug: "alpha",
        new_display_name: "Bravo",
      }),
    );
    await waitFor(() =>
      expect(toast.success.mock.calls[0][0]).toMatch(/2 agents moved, 1 failed/),
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("toasts a clean success when no agents failed", async () => {
    renameProjectFullAction.mockResolvedValue({
      ok: true,
      data: {
        full_rename: true,
        display_name: "Bravo",
        agents_relocated: ["a"],
        agents_failed: [],
      },
    });
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Bravo" } });
    fireEvent.click(screen.getByRole("button", { name: /rename workspace/i }));
    await waitFor(() =>
      expect(toast.success.mock.calls[0][0]).toMatch(/1 agents moved/),
    );
  });

  it("uses the display-name-only success toast when full_rename is false", async () => {
    renameProjectFullAction.mockResolvedValue({
      ok: true,
      data: { full_rename: false, display_name: "ALPHA" },
    });
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "ALPHA" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Renamed to "ALPHA"'),
    );
  });

  it("toasts the server error when rename fails", async () => {
    renameProjectFullAction.mockResolvedValue({ ok: false, error: "boom" });
    render(<ProjectRenameCard currentSlug="alpha" currentDisplayName="Alpha" />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Bravo" } });
    fireEvent.click(screen.getByRole("button", { name: /rename workspace/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
  });
});
