// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";

const { routerPush, toastFns } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  toastFns: {
    info: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: toastFns,
}));

vi.mock("@/components/markdown", () => ({
  Markdown: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

import { LiveTranscript } from "./live-transcript";
import type { TranscriptEvent } from "@/server/sessions/transcript-tail";

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

function setFetch(handler: FetchHandler) {
  // @ts-expect-error vitest jsdom env
  global.fetch = vi.fn(handler);
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof LiveTranscript>> = {}) {
  return {
    projectSlug: "demo",
    agentSlug: "cmo",
    agentDisplayName: "CMO",
    threadId: "t1",
    sessionKey: "agent:cmo:t1",
    initialEvents: [] as TranscriptEvent[],
    initialByteOffset: 0,
    ...overrides,
  };
}

function makeEmptyTranscriptResponse(byteOffset = 0) {
  return new Response(
    JSON.stringify({ events: [], byteOffset, file_size: byteOffset }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  routerPush.mockClear();
  toastFns.info.mockClear();
  toastFns.error.mockClear();
  toastFns.message.mockClear();
  setFetch(async () => makeEmptyTranscriptResponse());
  // jsdom doesn't implement scrollIntoView; the slash popover calls it inside
  // a useEffect after render. Polyfill once to avoid spurious crashes.
  // @ts-expect-error jsdom polyfill
  if (!Element.prototype.scrollIntoView) {
    // @ts-expect-error jsdom polyfill
    Element.prototype.scrollIntoView = () => {};
  }
  // Stable threadId per test won't pollute KICKOFF_FIRED guard for other tests.
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LiveTranscript empty state", () => {
  it("renders the empty state when no events and composer is idle", () => {
    render(<LiveTranscript {...defaultProps()} />);
    expect(
      screen.getByText(/no messages yet\. say hi to cmo/i),
    ).toBeInTheDocument();
  });

  it("hides the empty state when composerDisabled (task in flight)", () => {
    render(<LiveTranscript {...defaultProps({ composerDisabled: true, threadId: "t-disabled" })} />);
    expect(
      screen.queryByText(/no messages yet/i),
    ).not.toBeInTheDocument();
    // WorkingIndicator renders the agent display name as the accent
    // header and a verb-only headline next to it. With no events yet,
    // mood is "waiting" and the headline reads "Starting".
    expect(screen.getByText("CMO")).toBeInTheDocument();
    expect(screen.getByText(/^Starting$/)).toBeInTheDocument();
  });
});

describe("LiveTranscript rendering events", () => {
  it("renders user, assistant text and tool group bubbles", () => {
    const events: TranscriptEvent[] = [
      { kind: "user_message", id: "u1", ts: 1, body: "hello there" },
      { kind: "assistant_text", id: "a1", ts: 2, body: "hi back" },
      {
        kind: "tool_call",
        id: "t1",
        ts: 3,
        tool_call_id: "call-1",
        name: "read",
        label: "/etc/passwd",
      },
      {
        kind: "tool_result",
        id: "r1",
        ts: 4,
        tool_call_id: "call-1",
        name: "read",
        summary: "ok output",
        ok: true,
      },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-render" })} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
    expect(screen.getByTestId("markdown")).toHaveTextContent("hi back");
    // Tool group now leads with the humanized intent ("Read file") in
    // both summary and expanded row; raw tool identifier ("read") is
    // tucked into a small mono tag on the row, and the label path
    // surfaces as the target detail.
    expect(screen.getAllByText("Read file").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\/etc\/passwd/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/ok output/)).toBeInTheDocument();
    expect(screen.getByText(/→ result/)).toBeInTheDocument();
  });

  it("hides kickoff-style user messages from the transcript", () => {
    const events: TranscriptEvent[] = [
      { kind: "user_message", id: "u1", ts: 1, body: "(task assignment) audit the account" },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-kickoff" })} />);
    expect(screen.queryByText(/Task brief sent to agent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/audit the account/)).not.toBeInTheDocument();
  });

  it("shows error-status icon when the latest tool result failed", () => {
    const events: TranscriptEvent[] = [
      {
        kind: "tool_call",
        id: "t1",
        ts: 1,
        tool_call_id: "call-1",
        name: "fetch",
        label: "https://example.com",
      },
      {
        kind: "tool_result",
        id: "r1",
        ts: 2,
        tool_call_id: "call-1",
        name: "fetch",
        summary: "boom",
        ok: false,
      },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-err" })} />);
    expect(screen.getByText(/→ error/)).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("humanizes a wrapped shell command into a verb phrase (rg → Searched files)", () => {
    const events: TranscriptEvent[] = [
      {
        kind: "tool_call",
        id: "t1",
        ts: 1,
        tool_call_id: "call-rg",
        name: "shell",
        label: `/bin/zsh -lc "rg --files -g '!*node_modules*' | head -200"`,
      },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-shell-rg" })} />);
    expect(screen.getAllByText("Searched files").length).toBeGreaterThanOrEqual(1);
    // Raw command remains accessible in the expanded body.
    expect(screen.getAllByText(/rg --files/).length).toBeGreaterThanOrEqual(1);
  });

  it("humanizes legacy transcript rows where the raw command was stored as the tool name", () => {
    // Pre-0.4.3 codex events landed in SQLite with `name` = first line of
    // the shell command. The new humanizer should sniff the shell wrapper
    // out of the name when the label is missing/duplicated and surface
    // the intent verb instead of "Called md\"".
    const events: TranscriptEvent[] = [
      {
        kind: "tool_call",
        id: "t1",
        ts: 1,
        tool_call_id: "call-legacy",
        name: `/bin/zsh -lc "sed -n '1,220p' notfair-meta.json && sed -n '1,260p' IDENTITY.md"`,
        label: `/bin/zsh -lc "sed -n '1,220p' notfair-meta.json && sed -n '1,260p' IDENTITY.md"`,
      },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-legacy-shell" })} />);
    expect(screen.queryByText(/Called md/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Transformed text").length).toBeGreaterThanOrEqual(1);
  });

  it("humanizes a git subcommand from a wrapped shell line", () => {
    const events: TranscriptEvent[] = [
      {
        kind: "tool_call",
        id: "t1",
        ts: 1,
        tool_call_id: "call-git",
        name: "shell",
        label: `/bin/zsh -lc "git status --porcelain"`,
      },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-shell-git" })} />);
    expect(screen.getAllByText("Ran git status").length).toBeGreaterThanOrEqual(1);
  });

  it("matches an MCP catalog entry via codex's <namespaced-server>.<tool> name shape", () => {
    // Codex 0.132+ ships MCP invocations as `<configKey>.<tool>` where
    // configKey is the namespaced TOML section name we registered
    // (`notfair_<projectSlug>__<serverNameUnderscored>`). The favicon
    // matcher needs to peel that wrapper off so the bare server key
    // hits the catalog.
    const events: TranscriptEvent[] = [
      {
        kind: "tool_call",
        id: "t1",
        ts: 1,
        tool_call_id: "call-mcp-codex",
        name: "notfair_demo__notfair_googleads.listAdAccounts",
        label: "active campaigns",
      },
    ];
    render(
      <LiveTranscript
        {...defaultProps({
          initialEvents: events,
          threadId: "t-mcp-codex",
          mcpCatalog: [
            {
              key: "notfair-googleads",
              display_name: "NotFair Google Ads",
              resource_url: "https://notfair.co/api/mcp/google_ads",
            },
          ],
        })}
      />,
    );
    const imgs = screen.getAllByRole("img", { name: /NotFair Google Ads/ });
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    expect(imgs[0]!.getAttribute("src")).toMatch(/notfair\.co/);
  });

  it("renders an MCP brand favicon when a tool name matches a catalog entry", () => {
    const events: TranscriptEvent[] = [
      {
        kind: "tool_call",
        id: "t1",
        ts: 1,
        tool_call_id: "call-mcp",
        name: "mcp__notfair-googleads__listAdAccounts",
        label: "active campaigns",
      },
    ];
    render(
      <LiveTranscript
        {...defaultProps({
          initialEvents: events,
          threadId: "t-mcp-icon",
          mcpCatalog: [
            {
              key: "notfair-googleads",
              display_name: "NotFair Google Ads",
              resource_url: "https://notfair.co/api/mcp/google_ads",
            },
          ],
        })}
      />,
    );
    // Favicon img comes from the catalog entry's brand domain (notfair.co).
    const imgs = screen.getAllByRole("img", { name: /NotFair Google Ads/ });
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    expect(imgs[0]!.getAttribute("src")).toMatch(/notfair\.co/);
    // Humanized action verb.
    expect(screen.getAllByText(/list ad accounts/i).length).toBeGreaterThanOrEqual(1);
  });

  it("groups multiple consecutive tool calls into a single tool group with step count", () => {
    const events: TranscriptEvent[] = [
      {
        kind: "tool_call",
        id: "t1",
        ts: 1,
        tool_call_id: "c1",
        name: "read",
        label: "a.txt",
      },
      {
        kind: "tool_result",
        id: "r1",
        ts: 2,
        tool_call_id: "c1",
        name: "read",
        summary: "result a",
        ok: true,
      },
      {
        kind: "tool_call",
        id: "t2",
        ts: 3,
        tool_call_id: "c2",
        name: "read",
        label: "b.txt",
      },
      {
        kind: "tool_result",
        id: "r2",
        ts: 4,
        tool_call_id: "c2",
        name: "read",
        summary: "result b",
        ok: true,
      },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-grp" })} />);
    expect(screen.getByText(/2 steps/i)).toBeInTheDocument();
  });

  it("renders nothing for an assistant message whose body is whitespace-only", () => {
    const events: TranscriptEvent[] = [
      { kind: "assistant_text", id: "a1", ts: 1, body: "   " },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-strip" })} />);
    expect(screen.queryByTestId("markdown")).not.toBeInTheDocument();
  });

  it("returns null for system 'unknown' events (renders no row)", () => {
    const events: TranscriptEvent[] = [
      { kind: "unknown", id: "x1", ts: 1, raw_type: "session_metadata" },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-unknown" })} />);
    // No empty state (events.length > 0) and no rendered content.
    expect(screen.queryByText(/no messages yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText("session_metadata")).not.toBeInTheDocument();
  });
});

describe("LiveTranscript composer", () => {
  it("disables submit button when input is empty", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-sub" })} />);
    const submit = screen.getByRole("button", { name: /send/i });
    expect(submit).toBeDisabled();
  });

  it("enables submit once the user types", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-typ" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hi" } });
    expect(screen.getByRole("button", { name: /send/i })).not.toBeDisabled();
  });

  it("disables the composer textarea when composerDisabled is true", () => {
    render(<LiveTranscript {...defaultProps({ composerDisabled: true, threadId: "t-cd" })} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeDisabled();
    expect(textarea.placeholder).toMatch(/CMO is on a task/i);
  });

  it("keeps the composer enabled when the task is blocked and surfaces the paused pill + helper placeholder", () => {
    render(
      <LiveTranscript
        {...defaultProps({
          composerDisabled: false,
          blockedReason: "waiting on approval",
          threadId: "t-blocked",
        })}
      />,
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).not.toBeDisabled();
    expect(textarea.placeholder).toMatch(/Reply to CMO/i);
    // BlockedStatus pill replaces the live working indicator.
    expect(screen.getByText(/Paused — waiting on approval/)).toBeInTheDocument();
    expect(screen.queryByText(/^Starting$/)).not.toBeInTheDocument();
  });

  it("submitting Shift+Enter inserts a newline and does NOT send", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-shift" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "line 1" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    // Should NOT have called fetch with /api/chat — only background poll URLs.
    const f = global.fetch as ReturnType<typeof vi.fn>;
    const chatCalls = f.mock.calls.filter(
      ([u]) => typeof u === "string" && u.includes("/api/chat"),
    );
    expect(chatCalls.length).toBe(0);
  });
});

describe("LiveTranscript slash commands", () => {
  it("opens slash popover and filters as user types", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-slash" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/" } });
    expect(screen.getByRole("listbox", { name: /slash commands/i })).toBeInTheDocument();
    // /clear should appear in essential local commands
    expect(screen.getByText("/clear")).toBeInTheDocument();
  });

  it("clicking a slash command inserts the canonical text into the input", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-slash-click" })} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/cle" } });
    const option = screen.getByRole("option", { name: /\/clear/i });
    fireEvent.click(option);
    expect(textarea.value).toBe("/clear ");
  });

  it("clears the local view when /clear is submitted", async () => {
    const events: TranscriptEvent[] = [
      { kind: "user_message", id: "u1", ts: 1, body: "old turn" },
      { kind: "assistant_text", id: "a1", ts: 2, body: "old reply" },
    ];
    render(<LiveTranscript {...defaultProps({ initialEvents: events, threadId: "t-clear" })} />);
    expect(screen.getByText("old turn")).toBeInTheDocument();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/clear" } });
    // Close popover by adding a trailing space so the form-submit path runs.
    fireEvent.change(textarea, { target: { value: "/clear " } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => {
      expect(screen.queryByText("old turn")).not.toBeInTheDocument();
    });
    expect(toastFns.info).toHaveBeenCalled();
    // After clearing, idle empty state should reappear.
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("pushes a new chat URL when /new is submitted", async () => {
    // jsdom doesn't ship crypto.randomUUID in older versions — guarantee it.
    if (typeof crypto.randomUUID !== "function") {
      // @ts-expect-error patch for jsdom
      crypto.randomUUID = () => "11111111-1111-1111-1111-111111111111";
    }
    render(<LiveTranscript {...defaultProps({ threadId: "t-new" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/new " } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalled();
    });
    const target = routerPush.mock.calls[0]![0];
    expect(target).toMatch(/^\/demo\/agents\/cmo\/chat\//);
  });

  it("renders the help toast when /help is submitted", async () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-help" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/help " } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => expect(toastFns.message).toHaveBeenCalled());
  });

  it("escape closes the popover and clears the input", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-esc" })} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/cl" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(textarea.value).toBe("");
  });

  it("arrow keys cycle the slash command selection", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-arrow" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/" } });
    const items = screen.getAllByRole("option");
    expect(items.length).toBeGreaterThan(1);
    // First option is selected initially.
    expect(items[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    const afterDown = screen.getAllByRole("option");
    expect(afterDown[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    const afterUp = screen.getAllByRole("option");
    expect(afterUp[0]).toHaveAttribute("aria-selected", "true");
  });

  it("Tab in the popover inserts the highlighted command", () => {
    render(<LiveTranscript {...defaultProps({ threadId: "t-tab" })} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(textarea.value).toMatch(/^\/\S+\s$/);
  });
});

describe("LiveTranscript /api/chat send path", () => {
  it("posts the user message, streams SSE text into a pending bubble, and shows a stop button", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode("event: text\ndata: {\"chunk\":\"Hello \"}\n\n"),
        );
        controller.enqueue(
          encoder.encode("event: text\ndata: {\"chunk\":\"world\"}\n\n"),
        );
        controller.close();
      },
    });

    setFetch(async (url) => {
      if (url.includes("/api/chat")) {
        return new Response(stream, { status: 200 });
      }
      return makeEmptyTranscriptResponse();
    });

    render(<LiveTranscript {...defaultProps({ threadId: "t-send" })} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hi agent" } });
    fireEvent.submit(textarea.closest("form")!);

    // Optimistic user bubble appears immediately.
    await waitFor(() => {
      expect(screen.getByText("Hi agent")).toBeInTheDocument();
    });
    // Stream chunks should be rendered through Markdown stub.
    await waitFor(() => {
      const md = screen.getAllByTestId("markdown").pop();
      expect(md?.textContent).toContain("Hello world");
    });
    // Stop button is visible while sending.
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("renders an SSE-reported error and toasts when the stream emits an error event", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            "event: error\ndata: {\"message\":\"upstream failed\"}\n\n",
          ),
        );
        controller.close();
      },
    });
    setFetch(async (url) => {
      if (url.includes("/api/chat")) {
        return new Response(stream, { status: 200 });
      }
      return makeEmptyTranscriptResponse();
    });

    render(<LiveTranscript {...defaultProps({ threadId: "t-sse-err" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("upstream failed")).toBeInTheDocument();
    });
    expect(screen.getByText(/Couldn.t reach CMO/i)).toBeInTheDocument();
  });

  it("renders a thrown fetch error and surfaces a toast", async () => {
    setFetch(async (url) => {
      if (url.includes("/api/chat")) {
        return new Response("kaboom", { status: 500 });
      }
      return makeEmptyTranscriptResponse();
    });
    render(<LiveTranscript {...defaultProps({ threadId: "t-http-err" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "go" } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => {
      expect(toastFns.error).toHaveBeenCalled();
    });
    expect(screen.getByText("kaboom")).toBeInTheDocument();
  });

  it("streams a tool start event into the live tool group", async () => {
    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
        controller.enqueue(
          encoder.encode(
            "event: tool\ndata: {\"phase\":\"start\",\"tool_call_id\":\"c-1\",\"name\":\"shell\",\"label\":\"ls\"}\n\n",
          ),
        );
      },
    });
    setFetch(async (url) => {
      if (url.includes("/api/chat")) {
        return new Response(stream, { status: 200 });
      }
      return makeEmptyTranscriptResponse();
    });
    render(<LiveTranscript {...defaultProps({ threadId: "t-tool-stream" })} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "ls" } });
    fireEvent.submit(textarea.closest("form")!);
    await waitFor(() => {
      // Streamed tool starts now render with the humanized intent —
      // "ls" is recognized as a `Listed files` invocation.
      expect(screen.getAllByText("Listed files").length).toBeGreaterThanOrEqual(1);
    });
    // Raw "shell" identifier shows as a small mono tag on the expanded row.
    expect(screen.getAllByText("shell").length).toBeGreaterThanOrEqual(1);
    // Wrap up the stream so the send promise finishes before unmount.
    controllerRef!.close();
  });
});

describe("LiveTranscript polling", () => {
  it("polls the transcript endpoint and appends fresh events", async () => {
    const calls: string[] = [];
    let polled = 0;
    setFetch(async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/transcript")) {
        polled++;
        if (polled === 1) {
          const fresh: TranscriptEvent[] = [
            { kind: "assistant_text", id: "poll-a1", ts: 5, body: "polled in" },
          ];
          return new Response(
            JSON.stringify({ events: fresh, byteOffset: 200, file_size: 200 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return makeEmptyTranscriptResponse(200);
      }
      return makeEmptyTranscriptResponse();
    });

    vi.useFakeTimers();
    render(<LiveTranscript {...defaultProps({ threadId: "t-poll" })} />);
    // Advance past the default poll interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByTestId("markdown")).toHaveTextContent("polled in");
    });
    expect(calls.some((u) => u.includes("/transcript"))).toBe(true);
  });

  it("invokes onPolled with new event counts and stops polling when it returns true", async () => {
    let polled = 0;
    setFetch(async (url) => {
      if (String(url).includes("/transcript")) {
        polled++;
        return new Response(
          JSON.stringify({ events: [], byteOffset: 0, file_size: 42 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return makeEmptyTranscriptResponse();
    });
    const onPolled = vi.fn(() => true);
    vi.useFakeTimers();
    render(
      <LiveTranscript
        {...defaultProps({ threadId: "t-onpolled", onPolled })}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(onPolled).toHaveBeenCalledWith({ newEvents: 0, fileSize: 42 });
    // After stop, additional ticks shouldn't add more polls.
    const before = polled;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    vi.useRealTimers();
    expect(polled).toBe(before);
  });

  it("dedupes events by id across overlapping poll cycles", async () => {
    let polled = 0;
    setFetch(async (url) => {
      if (String(url).includes("/transcript")) {
        polled++;
        // Always return the same single event — second poll would duplicate.
        return new Response(
          JSON.stringify({
            events: [
              { kind: "assistant_text", id: "dup-1", ts: 1, body: "once" },
            ],
            byteOffset: 0,
            file_size: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return makeEmptyTranscriptResponse();
    });
    vi.useFakeTimers();
    render(<LiveTranscript {...defaultProps({ threadId: "t-dedupe" })} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    vi.useRealTimers();
    await waitFor(() => {
      const mds = screen.getAllByTestId("markdown");
      expect(mds.filter((m) => m.textContent === "once").length).toBe(1);
    });
    expect(polled).toBeGreaterThanOrEqual(2);
  });

  it("tolerates a non-OK transcript poll response", async () => {
    setFetch(async (url) => {
      if (String(url).includes("/transcript")) {
        return new Response("nope", { status: 500 });
      }
      return makeEmptyTranscriptResponse();
    });
    vi.useFakeTimers();
    render(<LiveTranscript {...defaultProps({ threadId: "t-poll-500" })} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    vi.useRealTimers();
    // No crash, empty state still rendered.
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });
});

describe("LiveTranscript autoKickoff", () => {
  it("fires a hidden first message via /api/chat when autoKickoff is true and transcript is empty", async () => {
    const encoder = new TextEncoder();
    let chatCalled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode("event: text\ndata: {\"chunk\":\"hi\"}\n\n"),
        );
        controller.close();
      },
    });
    setFetch(async (url, init) => {
      if (String(url).includes("/api/chat")) {
        chatCalled = true;
        const body = JSON.parse((init?.body as string) ?? "{}");
        // Carries the kickoff override.
        expect(body.message).toBe("kickoff!");
        return new Response(stream, { status: 200 });
      }
      return makeEmptyTranscriptResponse();
    });
    render(
      <LiveTranscript
        {...defaultProps({
          autoKickoff: true,
          kickoffMessage: "kickoff!",
          threadId: "t-kickoff-unique-1",
        })}
      />,
    );
    await waitFor(() => expect(chatCalled).toBe(true));
    // Hidden: no visible user bubble should show the kickoff text.
    expect(screen.queryByText("kickoff!")).not.toBeInTheDocument();
  });

  it("forwards taskId in the /api/chat body when autoKickoff fires", async () => {
    let observedBody: Record<string, unknown> | null = null;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("event: text\ndata: {\"chunk\":\"hi\"}\n\n"));
        controller.close();
      },
    });
    setFetch(async (url, init) => {
      if (String(url).includes("/api/chat")) {
        observedBody = JSON.parse((init?.body as string) ?? "{}");
        return new Response(stream, { status: 200 });
      }
      return makeEmptyTranscriptResponse();
    });
    render(
      <LiveTranscript
        {...defaultProps({
          autoKickoff: true,
          kickoffMessage: "kickoff body",
          taskId: "task-uuid-7",
          threadId: "t-kickoff-with-task-id",
        })}
      />,
    );
    await waitFor(() => expect(observedBody).not.toBeNull());
    expect(observedBody!.task_id).toBe("task-uuid-7");
  });

  it("treats a 409 from /api/chat as a benign no-op (no error toast, no thrown error)", async () => {
    setFetch(async (url) => {
      if (String(url).includes("/api/chat")) {
        return new Response(
          JSON.stringify({ error: "task already claimed", status: "working" }),
          { status: 409 },
        );
      }
      return makeEmptyTranscriptResponse();
    });
    render(
      <LiveTranscript
        {...defaultProps({
          autoKickoff: true,
          kickoffMessage: "kickoff body",
          taskId: "task-uuid-8",
          threadId: "t-kickoff-409",
        })}
      />,
    );
    // No error row should appear — 409 means "someone else claimed it"
    // and is expected during reloads / concurrent tabs.
    await new Promise((r) => setTimeout(r, 30));
    expect(
      screen.queryByText(/couldn[’']t reach/i),
    ).not.toBeInTheDocument();
  });

  it("does not auto-kickoff a second time for the same threadId (module guard)", async () => {
    // Re-uses the same threadId as the previous test which already added to KICKOFF_FIRED.
    let chatCalled = false;
    setFetch(async (url) => {
      if (String(url).includes("/api/chat")) {
        chatCalled = true;
        return new Response("", { status: 200 });
      }
      return makeEmptyTranscriptResponse();
    });
    render(
      <LiveTranscript
        {...defaultProps({
          autoKickoff: true,
          kickoffMessage: "kickoff!",
          threadId: "t-kickoff-unique-1",
        })}
      />,
    );
    // Give the effect a tick to run.
    await new Promise((r) => setTimeout(r, 20));
    expect(chatCalled).toBe(false);
  });
});
