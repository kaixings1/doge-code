// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const router = {
  push: vi.fn(),
  refresh: vi.fn(),
};
const renameAgentAction = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/server/actions/agents", () => ({
  renameAgentAction: (...args: unknown[]) => renameAgentAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
  },
}));

import { AgentRenameCard } from "./agent-rename-card";

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  renameAgentAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
});

function defaultProps() {
  return {
    agentId: "proj-bot",
    projectSlug: "proj",
    currentDisplayName: "Bot",
    currentSlug: "bot",
  };
}

describe("AgentRenameCard", () => {
  it("seeds the input with the current display name", () => {
    render(<AgentRenameCard {...defaultProps()} />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue("Bot");
  });

  it("renders the project slug as a non-editable prefix", () => {
    render(<AgentRenameCard {...defaultProps()} />);
    expect(screen.getByText("proj-")).toBeInTheDocument();
  });

  it("disables Save when the name is unchanged", () => {
    render(<AgentRenameCard {...defaultProps()} />);
    const btn = screen.getByRole("button", { name: /save name/i });
    expect(btn).toBeDisabled();
  });

  it("shows 'same slug' hint when only display-name casing changes (same slug)", () => {
    render(<AgentRenameCard {...defaultProps()} />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "BOT" } });
    expect(screen.getByText(/same slug/i)).toBeInTheDocument();
  });

  it("enables Save with a 'Save name' label when only the display name changes (same slug)", () => {
    render(<AgentRenameCard {...defaultProps()} />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "BOT" } });
    const btn = screen.getByRole("button", { name: /save name/i });
    expect(btn).not.toBeDisabled();
  });

  it("switches the button label to 'Rename agent' when the slug changes", () => {
    render(<AgentRenameCard {...defaultProps()} />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "marketing-lead" } });
    expect(
      screen.getByRole("button", { name: /rename agent/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/slug changes from/i)).toBeInTheDocument();
  });

  it("flags invalid slug input and disables the button", () => {
    render(<AgentRenameCard {...defaultProps()} />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "!!!" } });
    expect(screen.getByText(/invalid name/i)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /save name|rename agent/i });
    expect(btn).toBeDisabled();
  });

  it("calls renameAgentAction and routes on a full-rename success", async () => {
    renameAgentAction.mockResolvedValue({
      ok: true,
      data: { full_rename: true, slug: "marketer", display_name: "Marketer" },
    });
    render(<AgentRenameCard {...defaultProps()} />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "Marketer" } });
    fireEvent.click(screen.getByRole("button", { name: /rename agent/i }));
    await waitFor(() =>
      expect(renameAgentAction).toHaveBeenCalledWith({
        agent_id: "proj-bot",
        new_display_name: "Marketer",
      }),
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/proj/agents/marketer/settings"),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("only refreshes (no push) on a same-slug rename success", async () => {
    renameAgentAction.mockResolvedValue({
      ok: true,
      data: { full_rename: false, slug: "bot", display_name: "BOT" },
    });
    render(<AgentRenameCard {...defaultProps()} />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "BOT" } });
    fireEvent.click(screen.getByRole("button", { name: /save name/i }));
    await waitFor(() => expect(renameAgentAction).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("toasts the server error when rename fails", async () => {
    renameAgentAction.mockResolvedValue({ ok: false, error: "name taken" });
    render(<AgentRenameCard {...defaultProps()} />);
    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: "x-newname" } });
    fireEvent.click(screen.getByRole("button", { name: /rename agent/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("name taken"));
    expect(router.push).not.toHaveBeenCalled();
  });
});
