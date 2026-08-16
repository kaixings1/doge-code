// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { ThreadSelector, type SessionLite } from "./thread-selector";

function openTrigger() {
  const trigger = screen.getByRole("button");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
}

beforeEach(() => {
  pushMock.mockReset();
  // jsdom + radix dropdown rely on these primitives that older jsdom is missing.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  // Radix uses pointer events; jsdom lacks hasPointerCapture/setPointerCapture/releasePointerCapture
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    writable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    writable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

function makeSession(overrides: Partial<SessionLite> = {}): SessionLite {
  return {
    sessionId: "s-1",
    sessionKey: "agent:demo-cmo:s-1",
    label: "main",
    lastInteractionAt: Date.now() - 30_000,
    pending: false,
    ...overrides,
  };
}

describe("ThreadSelector trigger label", () => {
  it("renders 'Main thread' when active session.label is main", () => {
    const sessions = [makeSession({ label: "main" })];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Main thread/ }),
    ).toBeInTheDocument();
  });

  it("renders 'New thread · <prefix>' for pending sessions", () => {
    const sessions = [
      makeSession({ pending: true, sessionId: "1234567890abcdef", label: "ignored" }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="1234567890abcdef"
      />,
    );
    expect(
      screen.getByRole("button", { name: /New thread · 12345678/ }),
    ).toBeInTheDocument();
  });

  it("truncates long labels at 32 chars with an ellipsis", () => {
    const longLabel = "this-is-a-very-long-thread-label-that-exceeds-32-characters";
    const sessions = [makeSession({ label: longLabel })];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toContain(`${longLabel.slice(0, 32)}...`);
    expect(trigger.textContent).not.toContain(longLabel);
  });

  it("shows 'Pick a thread' when no active session matches", () => {
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={[makeSession()]}
        activeSessionId="not-here"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Pick a thread/ }),
    ).toBeInTheDocument();
  });

  it("renders the task as '<DISPLAY-ID> <title>' (uppercased id)", () => {
    const sessions = [
      makeSession({
        label: "8c2f1a1b-1234-4abc-9def-1234567890ab",
        origin: {
          kind: "task",
          display_id: "demo-7",
          title: "Audit and write PROJECT.md",
        },
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /DEMO-7 Audit and write PROJECT\.md/ }),
    ).toBeInTheDocument();
    // The raw UUID label must NOT leak into the trigger.
    expect(
      screen.queryByRole("button", { name: /8c2f1a1b/ }),
    ).toBeNull();
  });

  it("renders just the uppercased display_id when title is null", () => {
    const sessions = [
      makeSession({
        label: "8c2f1a1b-1234",
        origin: { kind: "task", display_id: "demo-3", title: null },
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toContain("DEMO-3");
    expect(trigger.textContent).not.toContain("demo-3");
  });

  it("renders the cron name when origin.kind is 'cron'", () => {
    const sessions = [
      makeSession({
        label: "cron:7f879fba-e3c8-412a-b576-34ded35b44a8:run:abc",
        origin: { kind: "cron", cron_name: "daily-audit" },
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /daily-audit/ }),
    ).toBeInTheDocument();
  });

  it("renders the first-message preview when origin.kind is 'chat'", () => {
    const sessions = [
      makeSession({
        label: "fresh-uuid",
        origin: { kind: "chat", preview: "what should we do about CPC drift?" },
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /what should we do about CPC drift\?/ }),
    ).toBeInTheDocument();
  });

  it("falls back to label when origin.kind is 'chat' but preview is empty", () => {
    const sessions = [
      makeSession({
        label: "main",
        origin: { kind: "chat", preview: "" },
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    // Empty preview should not blank the label out — keep the legacy
    // "Main thread" affordance so the trigger is never empty.
    expect(
      screen.getByRole("button", { name: /Main thread/ }),
    ).toBeInTheDocument();
  });
});

describe("ThreadSelector dropdown interactions", () => {
  it("opens the menu and lists sessions including counts", async () => {
    const sessions = [
      makeSession({ sessionId: "s-1", label: "main" }),
      makeSession({
        sessionId: "s-2-other",
        label: "feature branch",
        lastInteractionAt: Date.now() - 3_600_000,
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText(/Threads \(2\)/)).toBeInTheDocument();
      expect(screen.getByText("feature branch")).toBeInTheDocument();
      // session id prefix appears in the menu line.
      expect(screen.getAllByText(/s-1/).length).toBeGreaterThan(0);
    });
  });

  it("shows 'No threads yet' when sessions array is empty", async () => {
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={[]}
        activeSessionId=""
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText("No threads yet")).toBeInTheDocument();
      expect(screen.getByText(/Threads \(0\)/)).toBeInTheDocument();
    });
  });

  it("clicking a non-active session pushes to its chat URL", async () => {
    const sessions = [
      makeSession({ sessionId: "s-1", label: "main" }),
      makeSession({ sessionId: "s-2", label: "draft" }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText("draft")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("draft"));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/demo/agents/cmo/chat/s-2");
    });
  });

  it("clicking the active session is a no-op (no router.push)", async () => {
    const sessions = [makeSession({ sessionId: "s-1", label: "main" })];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    let menuitem: HTMLElement | null = null;
    await waitFor(() => {
      menuitem = screen.getByRole("menuitem", { name: /Main thread/ });
      expect(menuitem).toBeInTheDocument();
    });
    fireEvent.click(menuitem!);
    await new Promise((r) => setTimeout(r, 10));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("groups rows under Tasks / Crons / Chats section headers", async () => {
    const sessions = [
      makeSession({
        sessionId: "task-s",
        label: "uuid-task",
        origin: { kind: "task", display_id: "demo-1", title: "Do the thing" },
      }),
      makeSession({
        sessionId: "cron-s",
        label: "cron:abc:run:1",
        origin: { kind: "cron", cron_name: "daily-audit" },
      }),
      makeSession({
        sessionId: "chat-s",
        label: "uuid-chat",
        origin: { kind: "chat", preview: "hello there" },
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="task-s"
      />,
    );
    openTrigger();
    await waitFor(() => {
      // Section headers — each shows its own count, separate from the
      // outer "Threads (N)" total at the top of the menu.
      expect(screen.getByText(/^Tasks \(1\)$/)).toBeInTheDocument();
      expect(screen.getByText(/^Crons \(1\)$/)).toBeInTheDocument();
      expect(screen.getByText(/^Chats \(1\)$/)).toBeInTheDocument();
      // Outer total still present.
      expect(screen.getByText(/Threads \(3\)/)).toBeInTheDocument();
      // Each row's label rendered. DEMO-1 also appears in the trigger
      // (active session), so use getAllByText for that one specifically.
      expect(screen.getAllByText(/DEMO-1 Do the thing/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("daily-audit")).toBeInTheDocument();
      expect(screen.getByText("hello there")).toBeInTheDocument();
    });
  });

  it("omits sections that have no rows", async () => {
    const sessions = [
      makeSession({
        sessionId: "chat-only",
        label: "uuid-only",
        origin: { kind: "chat", preview: "just a chat" },
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="chat-only"
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText(/^Chats \(1\)$/)).toBeInTheDocument();
      expect(screen.queryByText(/^Tasks/)).toBeNull();
      expect(screen.queryByText(/^Crons/)).toBeNull();
    });
  });

  it("clicking 'New thread' navigates to a fresh uuid", async () => {
    // Stub crypto.randomUUID for determinism.
    const uuid = "11111111-2222-3333-4444-555555555555";
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => uuid },
    });
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={[makeSession()]}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText("New thread")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("New thread"));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(`/demo/agents/cmo/chat/${uuid}`);
    });
  });
});
