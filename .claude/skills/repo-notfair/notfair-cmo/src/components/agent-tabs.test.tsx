// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const pathnameRef: { current: string } = { current: "/proj/agents/cmo/tasks" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

import { AgentTabs } from "./agent-tabs";

beforeEach(() => {
  pathnameRef.current = "/proj/agents/cmo/tasks";
});

afterEach(() => {
  cleanup();
});

describe("AgentTabs", () => {
  it("renders all six tabs as links pointing under the agent base path", () => {
    render(<AgentTabs projectSlug="proj" agentSlug="cmo" />);
    const tasks = screen.getByRole("link", { name: /tasks/i });
    const chat = screen.getByRole("link", { name: /chat/i });
    const files = screen.getByRole("link", { name: /files/i });
    const skills = screen.getByRole("link", { name: /skills/i });
    const cron = screen.getByRole("link", { name: /cron/i });
    const settings = screen.getByRole("link", { name: /settings/i });
    expect(tasks).toHaveAttribute("href", "/proj/agents/cmo/tasks");
    expect(chat).toHaveAttribute("href", "/proj/agents/cmo/chat");
    expect(files).toHaveAttribute("href", "/proj/agents/cmo/files");
    expect(skills).toHaveAttribute("href", "/proj/agents/cmo/skills");
    expect(cron).toHaveAttribute("href", "/proj/agents/cmo/cron");
    expect(settings).toHaveAttribute("href", "/proj/agents/cmo/settings");
  });

  it("marks the tab as active when the pathname equals the tab href", () => {
    pathnameRef.current = "/proj/agents/cmo/chat";
    render(<AgentTabs projectSlug="proj" agentSlug="cmo" />);
    const chat = screen.getByRole("link", { name: /chat/i });
    expect(chat.className).toContain("text-foreground");
    expect(chat.className).not.toContain("text-muted-foreground");
    const tasks = screen.getByRole("link", { name: /tasks/i });
    expect(tasks.className).toContain("text-muted-foreground");
  });

  it("marks the tab as active for nested subpaths under it", () => {
    pathnameRef.current = "/proj/agents/cmo/tasks/abc123";
    render(<AgentTabs projectSlug="proj" agentSlug="cmo" />);
    const tasks = screen.getByRole("link", { name: /tasks/i });
    expect(tasks.className).toContain("text-foreground");
  });

  it("renders the underline indicator span only for the active tab", () => {
    pathnameRef.current = "/proj/agents/cmo/skills";
    const { container } = render(<AgentTabs projectSlug="proj" agentSlug="cmo" />);
    const indicators = container.querySelectorAll('span[aria-hidden="true"]');
    expect(indicators.length).toBe(1);
  });

  it("treats no-match pathname as no active tab", () => {
    pathnameRef.current = "/some/other/place";
    render(<AgentTabs projectSlug="proj" agentSlug="cmo" />);
    const tasks = screen.getByRole("link", { name: /tasks/i });
    expect(tasks.className).toContain("text-muted-foreground");
  });
});
