// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

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

const disableCronsAction = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

vi.mock("@/server/actions/agents", () => ({
  disableCronsAction: (...args: unknown[]) => disableCronsAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
    warning: (...args: unknown[]) => toast.warning(...args),
  },
}));

import { DisableSourceCronsDialog } from "./disable-source-crons-dialog";

beforeEach(() => {
  disableCronsAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
});

afterEach(() => cleanup());

function renderDialog(overrides: Partial<Parameters<typeof DisableSourceCronsDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onDone = vi.fn();
  const sourceCrons = overrides.sourceCrons ?? [
    { id: "c1", name: "daily-sweep", disabled: false },
    { id: "c2", name: "weekly-report", disabled: false },
    { id: "c3", name: "already-off", disabled: true },
  ];
  render(
    <DisableSourceCronsDialog
      open
      onOpenChange={onOpenChange}
      sourceLabel="acme-ads"
      newAgentId="new-ads"
      sourceCrons={sourceCrons}
      onDone={onDone}
      {...overrides}
    />,
  );
  return { onOpenChange, onDone };
}

describe("DisableSourceCronsDialog", () => {
  it("renders the source label, count, and new agent id in the description", () => {
    renderDialog();
    // dialog title escapes apostrophe
    expect(screen.getByRole("heading", { name: /Disable acme-ads.*cron jobs\?/i })).toBeInTheDocument();
    expect(screen.getByText(/We just copied 3 cron jobs/)).toBeInTheDocument();
    expect(screen.getByText("acme-ads")).toBeInTheDocument();
    expect(screen.getByText("new-ads")).toBeInTheDocument();
  });

  it("uses singular 'cron job' when there is exactly one", () => {
    renderDialog({ sourceCrons: [{ id: "c1", name: "just-one", disabled: false }] });
    expect(screen.getByText(/We just copied 1 cron job(?!s)/)).toBeInTheDocument();
  });

  it("lists each source cron's name and marks the already-disabled ones", () => {
    renderDialog();
    expect(screen.getByText("daily-sweep")).toBeInTheDocument();
    expect(screen.getByText("weekly-report")).toBeInTheDocument();
    expect(screen.getByText("already-off")).toBeInTheDocument();
    expect(screen.getByText(/already off/i)).toBeInTheDocument();
  });

  it("hides the list when there are no source crons", () => {
    renderDialog({ sourceCrons: [] });
    // No <ul> rendered → the rows should not exist
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it('"Keep them running" closes the dialog and signals done without calling the action', () => {
    const { onOpenChange, onDone } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /keep them running/i }));
    expect(disableCronsAction).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDone).toHaveBeenCalled();
  });

  it('"Disable on source" only disables the currently-enabled source crons', async () => {
    disableCronsAction.mockResolvedValue({ ok: true, data: { disabled: 2, failed: 0 } });
    const { onOpenChange, onDone } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /disable on source/i }));
    await waitFor(() => expect(disableCronsAction).toHaveBeenCalledWith(["c1", "c2"]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Disabled 2 crons on acme-ads"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDone).toHaveBeenCalled();
  });

  it("uses singular wording when only one cron is disabled", async () => {
    disableCronsAction.mockResolvedValue({ ok: true, data: { disabled: 1, failed: 0 } });
    renderDialog({ sourceCrons: [{ id: "only", name: "only-one", disabled: false }] });
    fireEvent.click(screen.getByRole("button", { name: /disable on source/i }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Disabled 1 cron on acme-ads"),
    );
  });

  it("emits a warning toast when some disables fail", async () => {
    disableCronsAction.mockResolvedValue({ ok: true, data: { disabled: 1, failed: 1 } });
    renderDialog({
      sourceCrons: [
        { id: "c1", name: "ok-one", disabled: false },
        { id: "c2", name: "bad-one", disabled: false },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /disable on source/i }));
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith("Disabled 1 crons (1 failed)"),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("toasts the server error when the action returns ok=false", async () => {
    disableCronsAction.mockResolvedValue({ ok: false, error: "Permission denied" });
    const { onOpenChange, onDone } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /disable on source/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Permission denied"));
    // Returns early — dialog stays open
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("short-circuits and closes when every source cron is already disabled", () => {
    const { onOpenChange, onDone } = renderDialog({
      sourceCrons: [
        { id: "c1", name: "off1", disabled: true },
        { id: "c2", name: "off2", disabled: true },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /disable on source/i }));
    expect(disableCronsAction).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDone).toHaveBeenCalled();
  });
});
