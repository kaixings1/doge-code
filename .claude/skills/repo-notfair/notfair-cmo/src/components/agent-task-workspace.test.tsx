// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── next/navigation -------------------------------------------------------
const replaceMock = vi.fn();
const refreshMock = vi.fn();
const searchParamsState: { qs: string } = { qs: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParamsState.qs),
}));

// next/link → plain anchor (no router behavior in jsdom).
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ── server actions --------------------------------------------------------
const cancelTaskMock = vi.fn();
vi.mock("@/server/actions/tasks", () => ({
  cancelTaskAction: (...a: unknown[]) => cancelTaskMock(...a),
  // StartAllTasksButton imports this too — give it a benign default.
  startAllProposedTasksAction: vi.fn().mockResolvedValue({
    ok: true,
    data: { started: 0, task_ids: [] },
  }),
}));

// ── sonner toasts ---------------------------------------------------------
const toastMocks = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastMocks.success(...a),
    error: (...a: unknown[]) => toastMocks.error(...a),
    info: (...a: unknown[]) => toastMocks.info(...a),
  },
}));

// ── LiveTranscript: heavy fetch / SSE component. Stub to a marker so we
//    can assert it mounts with the right props without dragging in its
//    polling machinery.
vi.mock("@/components/live-transcript", () => ({
  LiveTranscript: (props: Record<string, unknown>) => (
    <div
      data-testid="live-transcript"
      data-thread={String(props.threadId)}
      data-disabled={String(props.composerDisabled)}
    >
      LiveTranscript stub
    </div>
  ),
}));

import { AgentTaskWorkspace } from "./agent-task-workspace";
import type { Task } from "@/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "uuid-1",
    display_id: "demo-1",
    project_slug: "demo",
    agent_id: "demo-google-ads",
    title: "Set up daily anomaly check",
    brief: "Detect daily spend anomalies",
    success_criteria: "Send slack alert on 3σ deviation",
    deadline_iso: null,
    status: "proposed",
    result_json: null,
    error_message: null,
    thread_id: null,
    assigner_agent_id: "demo-cmo",
    blocked_by_task_id: null,
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof AgentTaskWorkspace>[0]> = {}) {
  return {
    projectSlug: "demo",
    agentSlug: "google-ads",
    agentFullId: "demo-google-ads",
    agentDisplayName: "Google Ads",
    tasks: [] as Task[],
    selected: null,
    proposedCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  replaceMock.mockReset();
  refreshMock.mockReset();
  cancelTaskMock.mockReset();
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  toastMocks.info.mockReset();
  searchParamsState.qs = "";
});

describe("AgentTaskWorkspace empty state", () => {
  it("shows 'Nothing assigned yet.' subtitle and zero count when tasks is empty", () => {
    render(<AgentTaskWorkspace {...baseProps()} />);
    expect(screen.getByText("Nothing assigned yet.")).toBeInTheDocument();
    expect(screen.getByText("The CMO will delegate tasks here.")).toBeInTheDocument();
    // Right pane empty state for hasTasks=false.
    expect(screen.getByText(/Google Ads has no tasks yet/)).toBeInTheDocument();
  });

  it("renders the 'Select a task' right-pane state when tasks exist but none selected", () => {
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [makeTask({ status: "done" })],
        })}
      />,
    );
    expect(screen.getByText("Select a task")).toBeInTheDocument();
    expect(screen.getByText(/Pick one from the left/)).toBeInTheDocument();
  });
});

describe("AgentTaskWorkspace in-flight summary + StartAllTasksButton", () => {
  it("counts running + proposed + approved as 'in flight' and hides the start-all button when proposedCount=0", () => {
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [
            makeTask({ id: "a", display_id: "demo-1", status: "working" }),
            makeTask({ id: "b", display_id: "demo-2", status: "approved" }),
            makeTask({ id: "c", display_id: "demo-3", status: "done" }),
          ],
          proposedCount: 0,
        })}
      />,
    );
    expect(screen.getByText(/in flight/)).toBeInTheDocument();
    // The summary "2 in flight" text is split across nodes; just look for "2".
    const inFlightPara = screen.getByText(/in flight/).closest("p");
    expect(inFlightPara?.textContent).toContain("2");
    expect(screen.queryByRole("button", { name: /Start all/ })).not.toBeInTheDocument();
  });

  it("renders the StartAllTasksButton when proposedCount > 0", () => {
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [makeTask({ status: "proposed" })],
          proposedCount: 1,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /Start all 1 task/ })).toBeInTheDocument();
  });

  it("falls back to 'All quiet.' when there are tasks but none in flight", () => {
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [makeTask({ status: "done" })],
        })}
      />,
    );
    expect(screen.getByText("All quiet.")).toBeInTheDocument();
  });
});

describe("AgentTaskWorkspace task list grouping", () => {
  it("groups tasks by status and labels each group", () => {
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [
            makeTask({ id: "1", display_id: "demo-1", status: "working" }),
            makeTask({ id: "2", display_id: "demo-2", status: "proposed" }),
            makeTask({ id: "3", display_id: "demo-3", status: "done" }),
            makeTask({ id: "4", display_id: "demo-4", status: "failed", error_message: "boom" }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    // Failed task surfaces the error message in the row.
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("falls back to brief.slice(0,80) when task.title is null", () => {
    const brief = "This is a fallback brief shown when the task has no title field at all and we need text.";
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [makeTask({ title: null, brief })],
        })}
      />,
    );
    expect(screen.getByText(brief.slice(0, 80))).toBeInTheDocument();
  });

  it("clicking a task row calls router.replace with the display_id as ?task=", () => {
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [makeTask({ display_id: "demo-7", status: "proposed" })],
        })}
      />,
    );
    fireEvent.click(screen.getByText("Set up daily anomaly check"));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      "?task=demo-7",
      { scroll: false },
    );
  });

  it("marks selected row via aria-current when ?task= matches display_id", () => {
    searchParamsState.qs = "task=demo-9";
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [
            makeTask({ id: "x", display_id: "demo-9", status: "proposed", title: "alpha" }),
            makeTask({ id: "y", display_id: "demo-10", status: "proposed", title: "beta" }),
          ],
        })}
      />,
    );
    const alphaBtn = screen.getByText("alpha").closest("button");
    const betaBtn = screen.getByText("beta").closest("button");
    expect(alphaBtn).toHaveAttribute("aria-current", "true");
    expect(betaBtn).not.toHaveAttribute("aria-current");
  });
});

describe("AgentTaskWorkspace selected-task panel", () => {
  it("renders title, display_id, status badge, and the live transcript stub", () => {
    const task = makeTask({
      display_id: "demo-42",
      title: "Audit yesterday's spend",
      status: "working",
    });
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [task],
          selected: {
            task,
            threadId: "thr-1",
            sessionKey: "agent:demo-google-ads:thr-1",
            initialEvents: [],
            initialByteOffset: 0, approvals: [], questions: [], kickoff: null,
          },
        })}
      />,
    );
    expect(screen.getAllByText("DEMO-42").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Audit yesterday's spend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("working").length).toBeGreaterThan(0);
    const stub = screen.getByTestId("live-transcript");
    expect(stub.getAttribute("data-thread")).toBe("thr-1");
    expect(stub.getAttribute("data-disabled")).toBe("true");
  });

  it("renders '(untitled task)' fallback when selected task title is null", () => {
    const task = makeTask({ title: null });
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [task],
          selected: {
            task,
            threadId: "thr-1",
            sessionKey: "agent:demo-google-ads:thr-1",
            initialEvents: [],
            initialByteOffset: 0, approvals: [], questions: [], kickoff: null,
          },
        })}
      />,
    );
    expect(screen.getByText("(untitled task)")).toBeInTheDocument();
  });

  it("expanding the Brief details surfaces brief + success criteria", () => {
    const task = makeTask({
      brief: "Brief body text",
      success_criteria: "Success criteria text",
      status: "done",
    });
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [task],
          selected: {
            task,
            threadId: "thr-1",
            sessionKey: "k",
            initialEvents: [],
            initialByteOffset: 0, approvals: [], questions: [], kickoff: null,
          },
        })}
      />,
    );
    expect(screen.getByText(/Brief body text/)).toBeInTheDocument();
    expect(screen.getByText("Success criteria")).toBeInTheDocument();
    expect(screen.getByText(/Success criteria text/)).toBeInTheDocument();
  });

  it("does not render the Cancel button on terminal-status tasks", () => {
    const task = makeTask({ status: "done" });
    render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [task],
          selected: {
            task,
            threadId: "thr-1",
            sessionKey: "k",
            initialEvents: [],
            initialByteOffset: 0, approvals: [], questions: [], kickoff: null,
          },
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /Cancel/ })).not.toBeInTheDocument();
  });
});

describe("AgentTaskWorkspace CancelTaskButton", () => {
  function renderWithRunningSelected() {
    const task = makeTask({ display_id: "demo-77", status: "working" });
    return render(
      <AgentTaskWorkspace
        {...baseProps({
          tasks: [task],
          selected: {
            task,
            threadId: "thr",
            sessionKey: "k",
            initialEvents: [],
            initialByteOffset: 0, approvals: [], questions: [], kickoff: null,
          },
        })}
      />,
    );
  }

  it("first click toggles to confirm state without calling the action", () => {
    renderWithRunningSelected();
    const btn = screen.getByRole("button", { name: /Cancel/ });
    fireEvent.click(btn);
    expect(screen.getByRole("button", { name: /Click again to cancel/ })).toBeInTheDocument();
    expect(cancelTaskMock).not.toHaveBeenCalled();
  });

  it("second click calls cancelTaskAction with display_id and refreshes on success", async () => {
    cancelTaskMock.mockResolvedValue({ ok: true });
    renderWithRunningSelected();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    fireEvent.click(screen.getByRole("button", { name: /Click again to cancel/ }));
    await waitFor(() => {
      expect(cancelTaskMock).toHaveBeenCalledWith("demo-77");
      expect(toastMocks.success).toHaveBeenCalledWith("Task cancelled.");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("surfaces server error via toast and resets the confirm state", async () => {
    cancelTaskMock.mockResolvedValue({ ok: false, error: "nope" });
    renderWithRunningSelected();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    fireEvent.click(screen.getByRole("button", { name: /Click again to cancel/ }));
    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("nope");
    });
    expect(refreshMock).not.toHaveBeenCalled();
    // Confirm state cleared.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
    });
  });
});
