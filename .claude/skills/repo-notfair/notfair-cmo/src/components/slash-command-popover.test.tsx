// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SlashCommandPopover } from "./slash-command-popover";
import {
  SLASH_COMMANDS,
  filterSlashCommands,
  type SlashCommand,
} from "@/lib/slash-commands";

// jsdom doesn't implement scrollIntoView; the popover calls it on every render.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

describe("SlashCommandPopover", () => {
  it("renders the empty state when no commands match", () => {
    render(
      <SlashCommandPopover
        commands={[]}
        selectedIndex={0}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    expect(screen.getByText("No matching slash commands.")).toBeInTheDocument();
    // Empty-state container is still a listbox.
    const empty = screen.getByRole("listbox", { name: "Slash commands" });
    expect(empty).toBeInTheDocument();
  });

  it("renders every command name with category label", () => {
    render(
      <SlashCommandPopover
        commands={SLASH_COMMANDS}
        selectedIndex={0}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    expect(screen.getByRole("listbox", { name: "Slash commands" })).toBeInTheDocument();
    // Each command shows up as an option with its `/name` displayed.
    for (const cmd of SLASH_COMMANDS) {
      const matches = screen.getAllByText((_, node) => {
        if (!node) return false;
        return node.tagName === "SPAN" && node.textContent?.startsWith(`/${cmd.name}`) === true;
      });
      expect(matches.length).toBeGreaterThan(0);
    }
    // Category labels are surfaced.
    expect(screen.getAllByText("Session").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Model").length).toBeGreaterThan(0);
  });

  it("marks the selected row with aria-selected and styles it active", () => {
    render(
      <SlashCommandPopover
        commands={SLASH_COMMANDS.slice(0, 3)}
        selectedIndex={1}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[1].className).toContain("bg-accent");
  });

  it("calls onSelect with the clicked command", () => {
    const onSelect = vi.fn();
    const subset: SlashCommand[] = SLASH_COMMANDS.slice(0, 2);
    render(
      <SlashCommandPopover
        commands={subset}
        selectedIndex={0}
        onSelect={onSelect}
        onHover={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(subset[1]);
  });

  it("calls onHover with the row index on mouse enter", () => {
    const onHover = vi.fn();
    render(
      <SlashCommandPopover
        commands={SLASH_COMMANDS.slice(0, 3)}
        selectedIndex={0}
        onSelect={() => {}}
        onHover={onHover}
      />,
    );
    fireEvent.mouseEnter(screen.getAllByRole("option")[2]);
    expect(onHover).toHaveBeenCalledWith(2);
  });

  it("renders a 'local' badge for executeLocal commands and omits it otherwise", () => {
    const local = SLASH_COMMANDS.find((c) => c.executeLocal)!;
    const remote = SLASH_COMMANDS.find((c) => !c.executeLocal)!;
    render(
      <SlashCommandPopover
        commands={[local, remote]}
        selectedIndex={0}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    const localBadges = screen.getAllByText("local");
    expect(localBadges).toHaveLength(1);
  });

  it("shows the args hint next to commands that declare one", () => {
    const withArgs = SLASH_COMMANDS.find((c) => c.args)!;
    render(
      <SlashCommandPopover
        commands={[withArgs]}
        selectedIndex={0}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    expect(screen.getByText(withArgs.args!)).toBeInTheDocument();
  });

  it("filterSlashCommands prefix-matches /cl to /clear", () => {
    // Sanity-check on the filter that drives the popover.
    const filtered = filterSlashCommands("/cl");
    expect(filtered.map((c) => c.name)).toContain("clear");
  });

  it("filterSlashCommands falls back to substring match", () => {
    const filtered = filterSlashCommands("/ace"); // no prefix; substring "ace" → trace
    expect(filtered.map((c) => c.name)).toContain("trace");
  });

  it("calls scrollIntoView on the selected row after mount", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    render(
      <SlashCommandPopover
        commands={SLASH_COMMANDS.slice(0, 4)}
        selectedIndex={2}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
