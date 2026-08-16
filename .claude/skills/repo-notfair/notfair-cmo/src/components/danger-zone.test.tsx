// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const router = {
  push: vi.fn(),
  refresh: vi.fn(),
};
const getProjectDeletionSummaryAction = vi.fn();
const deleteProjectAction = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/server/actions/projects", () => ({
  getProjectDeletionSummaryAction: (...args: unknown[]) =>
    getProjectDeletionSummaryAction(...args),
  deleteProjectAction: (...args: unknown[]) => deleteProjectAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
    warning: (...args: unknown[]) => toast.warning(...args),
  },
}));

import { DangerZone } from "./danger-zone";

const summary = {
  totals: { agents: 3, threads: 5, crons: 2, mcps: 1 },
  agents: [
    {
      agentId: "proj-cmo",
      display_name: "CMO",
      threadCount: 4,
      exists: true,
    },
    {
      agentId: "proj-old",
      display_name: "Old",
      threadCount: 0,
      exists: false,
    },
  ],
};

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  getProjectDeletionSummaryAction.mockReset();
  deleteProjectAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("DangerZone (project)", () => {
  it("renders the delete-workspace CTA card", () => {
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    expect(screen.getByText("Delete this workspace")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete workspace/i }),
    ).toBeInTheDocument();
  });

  it("opens the confirm dialog with loading state", async () => {
    getProjectDeletionSummaryAction.mockImplementation(
      () => new Promise(() => {}),
    );
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: /delete workspace/i }));
    expect(
      await screen.findByText(/counting what will be removed/i),
    ).toBeInTheDocument();
  });

  it("shows summary stats and existing agents in the dialog", async () => {
    getProjectDeletionSummaryAction.mockResolvedValue({ ok: true, data: summary });
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: /delete workspace/i }));
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getByText("Crons")).toBeInTheDocument();
    expect(screen.getByText("MCPs")).toBeInTheDocument();
    expect(screen.getByText("CMO")).toBeInTheDocument();
    expect(screen.getByText("proj-cmo")).toBeInTheDocument();
    expect(screen.getByText(/4 threads/)).toBeInTheDocument();
    expect(screen.queryByText("Old")).not.toBeInTheDocument();
  });

  it("renders the error message when summary load fails", async () => {
    getProjectDeletionSummaryAction.mockResolvedValue({
      ok: false,
      error: "boom",
    });
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: /delete workspace/i }));
    expect(
      await screen.findByText(/could not load deletion summary: boom/i),
    ).toBeInTheDocument();
  });

  it("deletes the project and routes home on success", async () => {
    getProjectDeletionSummaryAction.mockResolvedValue({ ok: true, data: summary });
    deleteProjectAction.mockResolvedValue({
      ok: true,
      data: {
        agents: [{ agentId: "a" }, { agentId: "b" }],
        crons: 2,
        agentsFailed: [],
        cronsFailed: 0,
      },
    });
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: /delete workspace/i }));
    await screen.findByText("CMO");
    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    await waitFor(() =>
      expect(deleteProjectAction).toHaveBeenCalledWith("alpha", "alpha"),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Deleted Alpha. 2 agents, 2 crons removed.",
      ),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
  });

  it("warns when partial failures happen on delete", async () => {
    getProjectDeletionSummaryAction.mockResolvedValue({ ok: true, data: summary });
    deleteProjectAction.mockResolvedValue({
      ok: true,
      data: {
        agents: [{ agentId: "a" }],
        crons: 1,
        agentsFailed: ["x"],
        cronsFailed: 2,
      },
    });
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: /delete workspace/i }));
    await screen.findByText("CMO");
    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    await waitFor(() =>
      expect(toast.warning.mock.calls[0][0]).toMatch(/3 issues/),
    );
  });

  it("toasts the server error on delete failure", async () => {
    getProjectDeletionSummaryAction.mockResolvedValue({ ok: true, data: summary });
    deleteProjectAction.mockResolvedValue({ ok: false, error: "denied" });
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: /delete workspace/i }));
    await screen.findByText("CMO");
    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("denied"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("closes the dialog on Cancel", async () => {
    getProjectDeletionSummaryAction.mockResolvedValue({ ok: true, data: summary });
    render(<DangerZone projectSlug="alpha" projectName="Alpha" />);
    fireEvent.click(screen.getByRole("button", { name: /delete workspace/i }));
    await screen.findByText("CMO");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText("CMO")).not.toBeInTheDocument());
  });
});
