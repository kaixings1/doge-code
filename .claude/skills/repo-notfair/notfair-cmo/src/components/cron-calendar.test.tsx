// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

if (typeof Element !== "undefined") {
  // @ts-expect-error - jsdom shim
  Element.prototype.hasPointerCapture ??= () => false;
  // @ts-expect-error - jsdom shim
  Element.prototype.setPointerCapture ??= () => {};
  // @ts-expect-error - jsdom shim
  Element.prototype.releasePointerCapture ??= () => {};
  // @ts-expect-error - jsdom shim
  Element.prototype.scrollIntoView ??= () => {};
}

const pauseCronAction = vi.fn();
const resumeCronAction = vi.fn();
const deleteCronAction = vi.fn();
const updateCronPromptAction = vi.fn();
const getCronRunsAction = vi.fn();

const toast = { success: vi.fn(), error: vi.fn() };

vi.mock("@/server/actions/crons", () => ({
  pauseCronAction: (...a: unknown[]) => pauseCronAction(...a),
  resumeCronAction: (...a: unknown[]) => resumeCronAction(...a),
  deleteCronAction: (...a: unknown[]) => deleteCronAction(...a),
  updateCronPromptAction: (...a: unknown[]) => updateCronPromptAction(...a),
}));

vi.mock("@/server/actions/cron-runs", () => ({
  getCronRunsAction: (...a: unknown[]) => getCronRunsAction(...a),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toast.success(...a),
    error: (...a: unknown[]) => toast.error(...a),
  },
}));

import { CronCalendar, type CalendarCron, type CalendarOccurrence } from "./cron-calendar";

beforeEach(() => {
  pauseCronAction.mockReset();
  resumeCronAction.mockReset();
  deleteCronAction.mockReset();
  updateCronPromptAction.mockReset();
  getCronRunsAction.mockReset();
  getCronRunsAction.mockResolvedValue({ ok: true, runs: [] });
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => cleanup());

// Build a fixed test world. startOfFirstDay is 14 days ago at local midnight,
// so we can have past + future occurrences relative to a stable "now".
function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function buildWorld() {
  const start = todayStart() - 3 * DAY; // window covers 3 days before today through day 3 (today is day 3)
  const todayAt9 = todayStart() + 9 * HOUR;
  const todayAt15 = todayStart() + 15 * HOUR;
  const yesterdayAt9 = todayStart() - 1 * DAY + 9 * HOUR;
  const tomorrowAt9 = todayStart() + 1 * DAY + 9 * HOUR;

  const cronsById: Record<string, CalendarCron> = {
    "cron-a": {
      id: "cron-a",
      short_name: "daily-opt",
      full_name: "acme/google-ads/daily-opt",
      agent_id: "acme-google-ads",
      agent_slug: "google-ads",
      schedule_text: "0 9 * * *",
      disabled: false,
      status_text: "ok",
      message: "Run the daily optimization sweep.",
      description: "Tunes bids each morning.",
      schedule_raw: { kind: "cron", expr: "0 9 * * *", tz: "America/Los_Angeles" },
    },
    "cron-b": {
      id: "cron-b",
      short_name: "weekly-review",
      full_name: "acme/seo/weekly-review",
      agent_id: "acme-seo",
      agent_slug: "seo",
      schedule_text: "0 9 * * 1",
      disabled: true,
      status_text: "paused",
      message: "Weekly SEO review.",
      schedule_raw: null,
    },
    "cron-c": {
      id: "cron-c",
      short_name: "hourly-ping",
      full_name: "acme/cmo/hourly-ping",
      agent_id: "acme-cmo",
      agent_slug: "cmo",
      schedule_text: "every 1h",
      disabled: false,
      status_text: "ok",
      // No message — the Prompt section should NOT render
      schedule_raw: { kind: "every", everyMs: 3_600_000 },
    },
  };

  const occurrences: CalendarOccurrence[] = [
    {
      at: yesterdayAt9,
      cron_id: "cron-a",
      cron_name: cronsById["cron-a"]!.full_name,
      short_name: "daily-opt",
      agent_id: "acme-google-ads",
      agent_slug: "google-ads",
      schedule_text: "0 9 * * *",
      run_status: "ok",
    },
    {
      at: todayAt9,
      cron_id: "cron-a",
      cron_name: cronsById["cron-a"]!.full_name,
      short_name: "daily-opt",
      agent_id: "acme-google-ads",
      agent_slug: "google-ads",
      schedule_text: "0 9 * * *",
      run_status: "error",
    },
    {
      at: todayAt15,
      cron_id: "cron-b",
      cron_name: cronsById["cron-b"]!.full_name,
      short_name: "weekly-review",
      agent_id: "acme-seo",
      agent_slug: "seo",
      schedule_text: "0 9 * * 1",
      cron_disabled: true,
    },
    {
      at: tomorrowAt9,
      cron_id: "cron-c",
      cron_name: cronsById["cron-c"]!.full_name,
      short_name: "hourly-ping",
      agent_id: "acme-cmo",
      agent_slug: "cmo",
      schedule_text: "every 1h",
    },
  ];

  return {
    start,
    numDays: 14,
    occurrences,
    cronsById,
    agentSlugs: ["cmo", "google-ads", "seo"],
    todayAt9,
    todayAt15,
    yesterdayAt9,
    tomorrowAt9,
  };
}

function renderCalendar() {
  const w = buildWorld();
  render(
    <CronCalendar
      startOfFirstDay={w.start}
      numDays={w.numDays}
      occurrences={w.occurrences}
      cronsById={w.cronsById}
      agentSlugs={w.agentSlugs}
    />,
  );
  return w;
}

describe("CronCalendar — filter chips", () => {
  it("defaults to 'Enabled' filter and hides disabled crons", () => {
    renderCalendar();
    const enabledTab = screen.getByRole("tab", { name: "Enabled" });
    expect(enabledTab).toHaveAttribute("aria-selected", "true");
    // disabled cron-b's chip should not be on the board
    expect(screen.queryAllByText("weekly-review")).toHaveLength(0);
    // enabled chips visible
    expect(screen.getAllByText("daily-opt").length).toBeGreaterThan(0);
    expect(screen.getByText("hourly-ping")).toBeInTheDocument();
  });

  it("switching to 'Disabled' shows only disabled crons", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("tab", { name: "Disabled" }));
    expect(screen.getByText("weekly-review")).toBeInTheDocument();
    expect(screen.queryAllByText("daily-opt")).toHaveLength(0);
    expect(screen.queryByText("hourly-ping")).not.toBeInTheDocument();
  });

  it("switching to 'All' shows enabled and disabled chips together", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("weekly-review")).toBeInTheDocument();
    expect(screen.getAllByText("daily-opt").length).toBeGreaterThan(0);
    expect(screen.getByText("hourly-ping")).toBeInTheDocument();
  });

  it("shows an empty-state when the active filter has no occurrences", () => {
    render(
      <CronCalendar
        startOfFirstDay={todayStart()}
        numDays={14}
        occurrences={[]}
        cronsById={{}}
        agentSlugs={[]}
      />,
    );
    expect(screen.getByText(/Nothing to show with this filter/i)).toBeInTheDocument();
  });
});

describe("CronCalendar — legend", () => {
  it("shows only the slugs that are currently visible (filtered by enabled crons)", () => {
    renderCalendar();
    // Enabled filter: cron-a (google-ads) + cron-c (cmo). Not seo.
    // Legend entries are font-mono spans with the slug text.
    const legend = screen.getAllByText(/^(google-ads|cmo|seo)$/i);
    const slugs = legend.map((el) => el.textContent);
    expect(slugs).toContain("google-ads");
    expect(slugs).toContain("cmo");
    expect(slugs).not.toContain("seo");
  });

  it("legend updates when filter switches to 'Disabled'", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("tab", { name: "Disabled" }));
    const legend = screen.getAllByText(/^(google-ads|cmo|seo)$/i);
    const slugs = legend.map((el) => el.textContent);
    expect(slugs).toContain("seo");
    expect(slugs).not.toContain("cmo");
    expect(slugs).not.toContain("google-ads");
  });
});

describe("CronCalendar — week navigator", () => {
  it("Prev is disabled at offset 0 (window already at start)", () => {
    renderCalendar();
    expect(screen.getByLabelText("Previous week")).toBeDisabled();
  });

  it("Next becomes disabled once we scroll one week (numDays=14, visible=7)", () => {
    renderCalendar();
    const next = screen.getByLabelText("Next week");
    expect(next).not.toBeDisabled();
    fireEvent.click(next);
    expect(next).toBeDisabled();
  });

  it("'Today' button resets back to offset 0", () => {
    renderCalendar();
    fireEvent.click(screen.getByLabelText("Next week"));
    expect(screen.getByLabelText("Previous week")).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(screen.getByLabelText("Previous week")).toBeDisabled();
  });
});

describe("CronCalendar — occurrence detail dialog", () => {
  it("clicking an occurrence chip opens the detail dialog with cron metadata", async () => {
    renderCalendar();
    const chips = screen.getAllByText("daily-opt");
    fireEvent.click(chips[0]!.closest("button")!);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    // Heading uses the short_name
    expect(screen.getAllByText("daily-opt").length).toBeGreaterThan(0);
    expect(screen.getByText("Tunes bids each morning.")).toBeInTheDocument();
    // Details rows
    expect(screen.getByText("acme/google-ads/daily-opt")).toBeInTheDocument();
    expect(screen.getByText("acme-google-ads")).toBeInTheDocument();
    expect(screen.getByText("0 9 * * *")).toBeInTheDocument();
  });

  it("loads runs via getCronRunsAction when a cron is selected", async () => {
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt")[0]!.closest("button")!);
    await waitFor(() => {
      expect(getCronRunsAction).toHaveBeenCalledWith(
        "cron-a",
        { kind: "cron", expr: "0 9 * * *", tz: "America/Los_Angeles" },
        200,
      );
    });
  });

  it("shows past-tick fallback when no matched run and time is in the past", async () => {
    renderCalendar();
    // yesterday's tick had run_status="ok" but our mocked runs are empty, so
    // matchedRun is null AND occ.at < Date.now() → "No run log for this occurrence."
    const chips = screen.getAllByText("daily-opt").map((n) => n.closest("button")!);
    fireEvent.click(chips[0]!); // first one is the older occurrence (yesterday)
    await waitFor(() => expect(getCronRunsAction).toHaveBeenCalled());
    // Result section should reflect "no run log" — first matching node wins.
    expect(await screen.findByText(/No run log for this occurrence|Not fired yet/i)).toBeInTheDocument();
  });

  it("shows 'Not fired yet' for future occurrences with no matched run", async () => {
    renderCalendar();
    // Click the tomorrow chip (hourly-ping)
    fireEvent.click(screen.getByText("hourly-ping").closest("button")!);
    await waitFor(() => expect(getCronRunsAction).toHaveBeenCalled());
    expect(await screen.findByText(/Not fired yet/i)).toBeInTheDocument();
  });

  it("shows 'scheduled' badge for future occurrences", async () => {
    renderCalendar();
    fireEvent.click(screen.getByText("hourly-ping").closest("button")!);
    expect(await screen.findByText("scheduled")).toBeInTheDocument();
  });

  it("shows 'past' badge for past occurrences with no matching run", async () => {
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    expect(await screen.findByText("past")).toBeInTheDocument();
  });

  it("shows raw status badge for a past occurrence with a matching run (exact tick)", async () => {
    const w = buildWorld();
    getCronRunsAction.mockResolvedValue({
      ok: true,
      runs: [
        {
          status: "ok",
          run_at_ms: w.yesterdayAt9,
          finished_at_ms: w.yesterdayAt9 + 30_000,
          duration_ms: 30_000,
          owning_occurrence_at_ms: w.yesterdayAt9,
          model: "claude-opus",
          provider: "anthropic",
          usage: { total_tokens: 12345 },
          summary: "Bid changes applied.",
        },
      ],
    });
    render(
      <CronCalendar
        startOfFirstDay={w.start}
        numDays={w.numDays}
        occurrences={w.occurrences}
        cronsById={w.cronsById}
        agentSlugs={w.agentSlugs}
      />,
    );
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    await waitFor(() => expect(getCronRunsAction).toHaveBeenCalled());
    // Badge shows raw status "ok"
    const badges = await screen.findAllByText(/^ok$/);
    expect(badges.length).toBeGreaterThan(0);
    // Result section shows the summary
    expect(await screen.findByText("Bid changes applied.")).toBeInTheDocument();
    // Tokens row
    expect(await screen.findByText("12,345")).toBeInTheDocument();
    // Model row
    expect(await screen.findByText(/claude-opus/)).toBeInTheDocument();
  });

  it("renders an Error section when the matched run has an error", async () => {
    const w = buildWorld();
    getCronRunsAction.mockResolvedValue({
      ok: true,
      runs: [
        {
          status: "error",
          run_at_ms: w.yesterdayAt9,
          finished_at_ms: w.yesterdayAt9 + 1_000,
          duration_ms: 1_000,
          owning_occurrence_at_ms: w.yesterdayAt9,
          error: "MCP token missing",
        },
      ],
    });
    render(
      <CronCalendar
        startOfFirstDay={w.start}
        numDays={w.numDays}
        occurrences={w.occurrences}
        cronsById={w.cronsById}
        agentSlugs={w.agentSlugs}
      />,
    );
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    expect(await screen.findByText("MCP token missing")).toBeInTheDocument();
  });

  it("renders the runs-error message when getCronRunsAction returns ok=false", async () => {
    getCronRunsAction.mockResolvedValue({ ok: false, error: "DB locked" });
    renderCalendar();
    fireEvent.click(screen.getByText("hourly-ping").closest("button")!);
    expect(await screen.findByText("DB locked")).toBeInTheDocument();
  });

  it("does NOT render a Prompt section when cron.message is undefined", async () => {
    renderCalendar();
    fireEvent.click(screen.getByText("hourly-ping").closest("button")!);
    await screen.findByRole("dialog");
    // No "Prompt" section header
    expect(screen.queryByRole("button", { name: /^prompt$/i, expanded: true })).not.toBeInTheDocument();
  });

  it("renders the prompt text in read-only mode by default", async () => {
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    expect(await screen.findByText(/Run the daily optimization sweep\./)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("clicking Edit reveals the textarea; Cancel restores read-only without calling the action", async () => {
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Run the daily optimization sweep.");
    fireEvent.change(textarea, { target: { value: "totally new prompt" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(updateCronPromptAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("Save with empty prompt toasts an error and does not call the action", async () => {
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Prompt cannot be empty."));
    expect(updateCronPromptAction).not.toHaveBeenCalled();
  });

  it("Save with unchanged prompt closes the editor without calling the action", async () => {
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    // value unchanged
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateCronPromptAction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("Save with new prompt calls updateCronPromptAction and toasts success", async () => {
    updateCronPromptAction.mockResolvedValue({ ok: true });
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "new prompt text" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(updateCronPromptAction).toHaveBeenCalledWith("cron-a", "new prompt text"),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Prompt updated"));
  });

  it("Save with server error toasts the error and keeps the editor open", async () => {
    updateCronPromptAction.mockResolvedValue({ ok: false, error: "openclaw rejected" });
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "another" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("openclaw rejected"));
    // editor still mounted
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});

describe("CronCalendar — collapsible sections", () => {
  it("a section's chevron button toggles open/closed", async () => {
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    const detailsHeader = await screen.findByRole("button", { name: /details/i, expanded: true });
    fireEvent.click(detailsHeader);
    expect(detailsHeader).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(detailsHeader);
    expect(detailsHeader).toHaveAttribute("aria-expanded", "true");
  });
});

describe("CronCalendar — cron actions (footer)", () => {
  it("shows Disable on an enabled cron and pauses it", async () => {
    pauseCronAction.mockResolvedValue({ ok: true });
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /disable/i }));
    await waitFor(() => expect(pauseCronAction).toHaveBeenCalledWith("cron-a"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Disabled: daily-opt"));
  });

  it("shows Enable on a disabled cron and resumes it", async () => {
    resumeCronAction.mockResolvedValue({ ok: true });
    renderCalendar();
    fireEvent.click(screen.getByRole("tab", { name: "Disabled" }));
    fireEvent.click(screen.getByText("weekly-review").closest("button")!);
    fireEvent.click(await screen.findByRole("button", { name: /enable/i }));
    await waitFor(() => expect(resumeCronAction).toHaveBeenCalledWith("cron-b"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Enabled: weekly-review"));
  });

  it("Delete prompts for confirmation; cancel skips the action", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /delete/i }));
    expect(deleteCronAction).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Delete invokes the action when confirmed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteCronAction.mockResolvedValue({ ok: true });
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /delete/i }));
    await waitFor(() => expect(deleteCronAction).toHaveBeenCalledWith("cron-a"));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Deleted: daily-opt"));
    confirmSpy.mockRestore();
  });

  it("toasts the server error when the cron action fails", async () => {
    pauseCronAction.mockResolvedValue({ ok: false, error: "nope" });
    renderCalendar();
    fireEvent.click(screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /disable/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nope"));
  });
});

describe("CronCalendar — chip rendering", () => {
  it("disabled occurrences render a strike-through time", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    // Disabled chip wraps its time in a span with line-through class
    const allChips = screen.getAllByRole("button");
    const disabledChip = allChips.find((b) => b.textContent?.includes("weekly-review"));
    expect(disabledChip).toBeDefined();
    const timeSpan = within(disabledChip!).getAllByText(/\d/)[0];
    expect(timeSpan?.className).toMatch(/line-through/);
  });

  it("ok status occurrence has aria-label='success' glyph", () => {
    renderCalendar();
    const yesterdayChip = screen.getAllByText("daily-opt").map((n) => n.closest("button")!)[0]!;
    expect(within(yesterdayChip).getByLabelText("success")).toBeInTheDocument();
  });

  it("error status occurrence has aria-label='error' glyph", () => {
    renderCalendar();
    const chips = screen.getAllByText("daily-opt").map((n) => n.closest("button")!);
    // The second daily-opt is today's "error" run
    expect(within(chips[1]!).getByLabelText("error")).toBeInTheDocument();
  });
});
