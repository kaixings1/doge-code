// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const startAllMock = vi.fn();
vi.mock("@/server/actions/tasks", () => ({
  startAllProposedTasksAction: (...a: unknown[]) => startAllMock(...a),
}));

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastInfoMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastErrorMock(...a),
    success: (...a: unknown[]) => toastSuccessMock(...a),
    info: (...a: unknown[]) => toastInfoMock(...a),
  },
}));

import { StartAllTasksButton } from "./start-all-tasks-button";

beforeEach(() => {
  refreshMock.mockReset();
  startAllMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  toastInfoMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StartAllTasksButton", () => {
  it("renders the count and is disabled when proposedCount is 0", () => {
    render(<StartAllTasksButton agentId="demo-cmo" proposedCount={0} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Start all 0 tasks");
  });

  it("renders singular noun for count == 1", () => {
    render(<StartAllTasksButton agentId="demo-cmo" proposedCount={1} />);
    expect(screen.getByRole("button").textContent).toContain("Start all 1 task");
    expect(screen.getByRole("button").textContent).not.toContain("tasks");
  });

  it("renders plural noun for count > 1", () => {
    render(<StartAllTasksButton agentId="demo-cmo" proposedCount={3} />);
    expect(screen.getByRole("button").textContent).toContain("Start all 3 tasks");
  });

  it("shows an error toast when the action fails", async () => {
    startAllMock.mockResolvedValue({ ok: false, error: "no project" });
    render(<StartAllTasksButton agentId="demo-cmo" proposedCount={2} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("no project");
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows an info toast and skips polling when started == 0", async () => {
    startAllMock.mockResolvedValue({ ok: true, data: { started: 0, task_ids: [] } });
    render(<StartAllTasksButton agentId="demo-cmo" proposedCount={2} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledWith("No proposed tasks to start.");
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("toasts singular when only one task was started", async () => {
    startAllMock.mockResolvedValue({ ok: true, data: { started: 1, task_ids: ["t-1"] } });
    render(<StartAllTasksButton agentId="demo-cmo" proposedCount={2} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Started 1 task.");
    });
  });

  it("toasts plural and triggers refresh and entries polling on success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    startAllMock.mockResolvedValue({ ok: true, data: { started: 2, task_ids: ["t-1", "t-2"] } });
    render(<StartAllTasksButton agentId="demo-cmo" proposedCount={2} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Started 2 tasks.");
    });
    // First refresh is the immediate one from the action's success branch.
    expect(refreshMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Advance 3s — one polling interval — to trigger another refresh.
    const before = refreshMock.mock.calls.length;
    vi.advanceTimersByTime(3_000);
    expect(refreshMock.mock.calls.length).toBeGreaterThan(before);
    // While polling, the button stays disabled and the label is "Working…".
    await waitFor(() => {
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByRole("button").textContent).toContain("Working…");
    });
    // After the 2-minute timeout, polling stops and button re-enables.
    vi.advanceTimersByTime(120_000);
    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });
});
