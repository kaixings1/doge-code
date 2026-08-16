// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { WorkingIndicator, type WorkingPhase } from "./working-indicator";

function basePhases(): WorkingPhase[] {
  return [
    { id: "1", label: "list_project_agents", state: "done" },
    { id: "2", label: "summarizeAccountSetup", state: "done" },
    { id: "3", label: "runScript", state: "active" },
  ];
}

describe("WorkingIndicator", () => {
  it("renders the agent name, headline, and elapsed readout", () => {
    render(
      <WorkingIndicator
        agentDisplayName="CMO"
        headline="Calling runScript"
        subtitle={`{"accountId":"3251706605"}`}
        phases={basePhases()}
        elapsedMs={18_000}
        mood="tool"
      />,
    );
    expect(screen.getByText("CMO")).toBeInTheDocument();
    expect(screen.getByText(/Calling runScript/)).toBeInTheDocument();
    // The elapsed pill formats mm:ss when >= 1s and < 1min.
    expect(screen.getByText(/0:18/)).toBeInTheDocument();
  });

  it("renders the trajectory chips (done + active)", () => {
    render(
      <WorkingIndicator
        agentDisplayName="CMO"
        headline="Calling runScript"
        phases={basePhases()}
        elapsedMs={0}
        mood="tool"
      />,
    );
    // Last 3 phases are visible by design (the trajectory cap).
    expect(screen.getByText("list_project_agents")).toBeInTheDocument();
    expect(screen.getByText("summarizeAccountSetup")).toBeInTheDocument();
    // Multiple "runScript" text appearances may exist (chip + headline)
    expect(screen.getAllByText("runScript").length).toBeGreaterThanOrEqual(1);
  });

  it("hides the elapsed pill when elapsedMs is null", () => {
    render(
      <WorkingIndicator
        agentDisplayName="CMO"
        headline="Starting"
        phases={[]}
        elapsedMs={null}
        mood="waiting"
      />,
    );
    // 0:00 / Nan etc shouldn't appear; the digital pill is gone entirely.
    expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
  });

  it("formats elapsed as mm:ss past 60s", () => {
    render(
      <WorkingIndicator
        agentDisplayName="CMO"
        headline="Calling runScript"
        phases={basePhases()}
        elapsedMs={75_000}
        mood="tool"
      />,
    );
    expect(screen.getByText("1:15")).toBeInTheDocument();
  });

  it("uses mood-specific ring color (smoke test via class presence)", () => {
    const { container, rerender } = render(
      <WorkingIndicator
        agentDisplayName="CMO"
        headline="..."
        phases={[]}
        elapsedMs={0}
        mood="waiting"
      />,
    );
    expect(container.querySelector(".ring-sky-500\\/15")).not.toBeNull();
    rerender(
      <WorkingIndicator
        agentDisplayName="CMO"
        headline="..."
        phases={[]}
        elapsedMs={0}
        mood="writing"
      />,
    );
    expect(container.querySelector(".ring-emerald-500\\/15")).not.toBeNull();
  });
});
