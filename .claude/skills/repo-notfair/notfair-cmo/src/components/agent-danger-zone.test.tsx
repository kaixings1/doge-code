// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const router = {
  push: vi.fn(),
  refresh: vi.fn(),
};
const getAgentDeletionSummaryAction = vi.fn();
const deleteAgentCascadeAction = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/server/actions/agents", () => ({
  getAgentDeletionSummaryAction: (...args: unknown[]) =>
    getAgentDeletionSummaryAction(...args),
  deleteAgentCascadeAction: (...args: unknown[]) =>
    deleteAgentCascadeAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
    warning: (...args: unknown[]) => toast.warning(...args),
  },
}));

import { AgentDangerZone } from "./agent-danger-zone";

const fullSummary = {
  agent_id: "proj-cmo",
  template_key: "cmo",
  source_agent_id: "src",
  exists_in_openclaw: true,
  crons: [
    { id: "c1", name: "proj/cmo/daily", disabled: false },
    { id: "c2", name: "proj/cmo/weekly", disabled: true },
  ],
  threads: [
    { session_id: "s1", label: "main", last_interaction_at: Date.now() - 30_000 },
    { session_id: "s2", label: "another-thread-name-that-is-much-too-long", last_interaction_at: 0 },
  ],
};

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  getAgentDeletionSummaryAction.mockReset();
  deleteAgentCascadeAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AgentDangerZone", () => {
  it("renders the delete-agent CTA", () => {
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    expect(screen.getByText("Delete this agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete agent/i })).toBeInTheDocument();
  });

  it("opens the confirm dialog and shows loading state", async () => {
    getAgentDeletionSummaryAction.mockImplementation(
      () => new Promise(() => {}),
    );
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    expect(
      await screen.findByText(/counting what will be removed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Delete .*CMO/i }),
    ).toBeInTheDocument();
  });

  it("shows the summary error when loading the summary fails", async () => {
    getAgentDeletionSummaryAction.mockResolvedValue({
      ok: false,
      error: "could not load",
    });
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    expect(await screen.findByText("could not load")).toBeInTheDocument();
  });

  it("renders cron jobs and thread rows from the deletion summary", async () => {
    getAgentDeletionSummaryAction.mockResolvedValue({
      ok: true,
      data: fullSummary,
    });
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    expect(await screen.findByText(/Cron jobs \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Threads \(2\)/)).toBeInTheDocument();
    expect(screen.getByText("proj/cmo/daily")).toBeInTheDocument();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByText("Main thread")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("shows the empty-state hint when an item list is empty", async () => {
    getAgentDeletionSummaryAction.mockResolvedValue({
      ok: true,
      data: { ...fullSummary, crons: [], threads: [] },
    });
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    expect(
      await screen.findByText(/No scheduled jobs target this agent/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/No chat threads yet/i)).toBeInTheDocument();
  });

  it("calls deleteAgentCascadeAction and routes home on success", async () => {
    getAgentDeletionSummaryAction.mockResolvedValue({
      ok: true,
      data: fullSummary,
    });
    deleteAgentCascadeAction.mockResolvedValue({
      ok: true,
      data: { crons_removed: 2, crons_failed: 0 },
    });
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    await screen.findByText(/Cron jobs \(2\)/);
    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    await waitFor(() =>
      expect(deleteAgentCascadeAction).toHaveBeenCalledWith("proj-cmo"),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Deleted CMO. 2 crons removed.",
      ),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
  });

  it("warns when some crons fail to remove during delete", async () => {
    getAgentDeletionSummaryAction.mockResolvedValue({
      ok: true,
      data: fullSummary,
    });
    deleteAgentCascadeAction.mockResolvedValue({
      ok: true,
      data: { crons_removed: 1, crons_failed: 1 },
    });
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    await screen.findByText(/Cron jobs \(2\)/);
    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        "Deleted CMO. 1 crons removed, 1 failed.",
      ),
    );
  });

  it("toasts the server error when delete fails", async () => {
    getAgentDeletionSummaryAction.mockResolvedValue({
      ok: true,
      data: fullSummary,
    });
    deleteAgentCascadeAction.mockResolvedValue({
      ok: false,
      error: "nope",
    });
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    await screen.findByText(/Cron jobs \(2\)/);
    fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nope"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("closes the dialog when Cancel is clicked", async () => {
    getAgentDeletionSummaryAction.mockResolvedValue({
      ok: true,
      data: fullSummary,
    });
    render(<AgentDangerZone agentId="proj-cmo" agentDisplayName="CMO" />);
    fireEvent.click(screen.getByRole("button", { name: /delete agent/i }));
    await screen.findByText(/Cron jobs \(2\)/);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByText(/Cron jobs/)).not.toBeInTheDocument(),
    );
  });
});
