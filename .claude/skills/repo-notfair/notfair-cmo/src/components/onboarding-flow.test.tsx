// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

const {
  createProjectForOnboardingAction,
  startMcpConnect,
  listGoogleAdsAccounts,
  setOnboardingAccountAction,
  getOnboardingTaskForSkipAction,
  getProvisioningProgressAction,
  getConnectStepStateAction,
  listMetaAdsAccounts,
  setOnboardingMetaAdsAccountAction,
  listGscProperties,
  setOnboardingGscPropertyAction,
  addUserMcpServerAction,
  routerPush,
  routerReplace,
  toastFns,
  searchParamsRef,
} = vi.hoisted(() => ({
  createProjectForOnboardingAction: vi.fn(),
  startMcpConnect: vi.fn(),
  listGoogleAdsAccounts: vi.fn(),
  setOnboardingAccountAction: vi.fn(),
  getOnboardingTaskForSkipAction: vi.fn(),
  getProvisioningProgressAction: vi.fn(),
  getConnectStepStateAction: vi.fn(),
  listMetaAdsAccounts: vi.fn(),
  setOnboardingMetaAdsAccountAction: vi.fn(),
  listGscProperties: vi.fn(),
  setOnboardingGscPropertyAction: vi.fn(),
  addUserMcpServerAction: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  toastFns: {
    success: vi.fn(),
    error: vi.fn(),
  },
  searchParamsRef: { current: new URLSearchParams() },
}));

vi.mock("@/server/actions/projects", () => ({
  createProjectForOnboardingAction: (...args: unknown[]) =>
    createProjectForOnboardingAction(...args),
}));

vi.mock("@/server/actions/mcp", () => ({
  startMcpConnect: (...args: unknown[]) => startMcpConnect(...args),
  addUserMcpServerAction: (...args: unknown[]) => addUserMcpServerAction(...args),
}));

vi.mock("@/server/onboarding/accounts", () => ({
  listGoogleAdsAccounts: (...args: unknown[]) => listGoogleAdsAccounts(...args),
  setOnboardingAccountAction: (...args: unknown[]) =>
    setOnboardingAccountAction(...args),
  getOnboardingTaskForSkipAction: (...args: unknown[]) =>
    getOnboardingTaskForSkipAction(...args),
  getProvisioningProgressAction: (...args: unknown[]) =>
    getProvisioningProgressAction(...args),
  getConnectStepStateAction: (...args: unknown[]) =>
    getConnectStepStateAction(...args),
  listMetaAdsAccounts: (...args: unknown[]) => listMetaAdsAccounts(...args),
  setOnboardingMetaAdsAccountAction: (...args: unknown[]) =>
    setOnboardingMetaAdsAccountAction(...args),
  listGscProperties: (...args: unknown[]) => listGscProperties(...args),
  setOnboardingGscPropertyAction: (...args: unknown[]) =>
    setOnboardingGscPropertyAction(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => searchParamsRef.current,
}));

vi.mock("sonner", () => ({
  toast: toastFns,
}));

import { OnboardingFlow } from "./onboarding-flow";

function setStep(step: string | null, slug?: string | null) {
  const p = new URLSearchParams();
  if (step) p.set("step", step);
  if (slug) p.set("slug", slug);
  searchParamsRef.current = p;
}

function setLocationHref() {
  const fake = { href: "" } as Location & { href: string };
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: fake,
  });
  return fake;
}

beforeEach(() => {
  createProjectForOnboardingAction.mockReset();
  startMcpConnect.mockReset();
  listGoogleAdsAccounts.mockReset();
  setOnboardingAccountAction.mockReset();
  getOnboardingTaskForSkipAction.mockReset();
  getProvisioningProgressAction.mockReset();
  getConnectStepStateAction.mockReset();
  listMetaAdsAccounts.mockReset();
  setOnboardingMetaAdsAccountAction.mockReset();
  listGscProperties.mockReset();
  setOnboardingGscPropertyAction.mockReset();
  addUserMcpServerAction.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
  toastFns.success.mockReset();
  toastFns.error.mockReset();
  searchParamsRef.current = new URLSearchParams();
  // Sensible default — connect-step renders need this to resolve.
  getConnectStepStateAction.mockResolvedValue({
    ok: true,
    state: {
      googleads: { connected: false, account_selected: false },
      metaads: { connected: false, account_selected: false },
      gsc: { connected: false, account_selected: false },
      extras: [],
      extra_connected_count: 0,
      website_url: null,
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("OnboardingFlow — NameStep (default step)", () => {
  it("renders the project-name form when no step param is set", () => {
    render(<OnboardingFlow />);
    expect(
      screen.getByRole("heading", { name: /Let.s set up your workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
  });

  it("renders the skip-to-content link for keyboard users", () => {
    render(<OnboardingFlow />);
    const skip = screen.getByText(/Skip to content/i);
    expect(skip).toHaveAttribute("href", "#onboarding-main");
  });

  it("invokes createProjectForOnboardingAction and pushes to ?step=connect on success", async () => {
    createProjectForOnboardingAction.mockResolvedValue({
      ok: true,
      data: { slug: "acme-q4", display_name: "Acme Q4" },
    });
    render(<OnboardingFlow />);
    fireEvent.change(screen.getByLabelText(/Name/i), {
      target: { value: "Acme Q4" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(createProjectForOnboardingAction).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(
        "/onboarding?step=connect&slug=acme-q4",
      ),
    );
  });

  it("renders an inline error alert when the server action returns ok=false", async () => {
    createProjectForOnboardingAction.mockResolvedValue({
      ok: false,
      error: "Please enter a workspace name.",
    });
    render(<OnboardingFlow />);
    fireEvent.change(screen.getByLabelText(/Name/i), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please enter a workspace name.");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("URL-encodes the slug returned from the server action", async () => {
    createProjectForOnboardingAction.mockResolvedValue({
      ok: true,
      data: { slug: "weird slug/with chars", display_name: "Weird" },
    });
    render(<OnboardingFlow />);
    fireEvent.change(screen.getByLabelText(/Name/i), {
      target: { value: "Weird" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(
        `/onboarding?step=connect&slug=${encodeURIComponent("weird slug/with chars")}`,
      ),
    );
  });
});

describe("OnboardingFlow — MissingSlug", () => {
  it("renders the missing-slug card when step=connect but no slug", () => {
    setStep("connect", null);
    render(<OnboardingFlow />);
    expect(
      screen.getByText(/This step needs a workspace. Start from the beginning./i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Start over/i }),
    ).toHaveAttribute("href", "/onboarding");
  });

  it("renders the missing-slug card when step=account but no slug", () => {
    setStep("account", null);
    render(<OnboardingFlow />);
    expect(
      screen.getByText(/This step needs a workspace. Start from the beginning./i),
    ).toBeInTheDocument();
  });
});

describe("OnboardingFlow — ConnectStep", () => {
  it("renders the three recommended-MCP tiles + Skip when nothing is connected", async () => {
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    expect(
      await screen.findByRole("heading", { name: /Connect MCPs to your agents/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Google Ads/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Meta Ads/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Google Search Console/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /More tools/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Skip/i }),
    ).toBeInTheDocument();
  });

  it("starts OAuth for Google Ads with a connect-step return_to", async () => {
    const loc = setLocationHref();
    startMcpConnect.mockResolvedValue({
      ok: true,
      authorize_url: "https://issuer.example/oauth",
    });
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    fireEvent.click(await screen.findByRole("button", { name: /^Google Ads/i }));
    await waitFor(() =>
      expect(startMcpConnect).toHaveBeenCalledWith({
        mcp_key: "notfair-googleads",
        return_to: "/onboarding?step=account&slug=acme",
      }),
    );
    await waitFor(() =>
      expect(loc.href).toBe("https://issuer.example/oauth"),
    );
  });

  it("toasts and re-enables the tile when startMcpConnect returns ok=false", async () => {
    startMcpConnect.mockResolvedValue({ ok: false, error: "registration failed" });
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    const tile = await screen.findByRole("button", { name: /^Google Ads/i });
    fireEvent.click(tile);
    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith("registration failed"),
    );
    expect(tile).not.toBeDisabled();
  });

  it("toasts the thrown error when startMcpConnect throws", async () => {
    startMcpConnect.mockRejectedValue(new Error("offline"));
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    fireEvent.click(await screen.findByRole("button", { name: /^Google Ads/i }));
    await waitFor(() =>
      expect(toastFns.error).toHaveBeenCalledWith("offline"),
    );
  });

  it("hands off to the setup screen via Skip when zero MCPs are connected", async () => {
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    fireEvent.click(await screen.findByRole("button", { name: /^Skip/i }));
    expect(routerReplace).toHaveBeenCalledWith(
      "/onboarding?step=setup&slug=acme&from=skip",
    );
  });

  it("flips Skip → 'Next' once at least one MCP is connected", async () => {
    getConnectStepStateAction.mockResolvedValue({
      ok: true,
      state: {
        googleads: { connected: true, account_selected: true },
        metaads: { connected: false, account_selected: false },
        gsc: { connected: false, account_selected: false },
        extras: [],
        extra_connected_count: 0,
        website_url: null,
      },
    });
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    const done = await screen.findByRole("button", { name: /^Next/i });
    expect(done).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Skip/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(done);
    expect(routerReplace).toHaveBeenCalledWith(
      "/onboarding?step=setup&slug=acme&from=connect",
    );
  });

  it("renders a row for each extra MCP connected via the More dialog", async () => {
    getConnectStepStateAction.mockResolvedValue({
      ok: true,
      state: {
        googleads: { connected: false, account_selected: false },
        metaads: { connected: false, account_selected: false },
        gsc: { connected: false, account_selected: false },
        extras: [
          {
            key: "stripe",
            display_name: "Stripe",
            description: "Payments.",
            resource_url: "https://mcp.stripe.com/",
          },
          {
            key: "supabase",
            display_name: "Supabase",
            description: "Postgres.",
            resource_url: "https://mcp.supabase.com/mcp",
          },
        ],
        extra_connected_count: 2,
        website_url: null,
      },
    });
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    // Both extras render as new rows in the grouped list, each with their
    // display name visible.
    expect(await screen.findByText("Stripe")).toBeInTheDocument();
    expect(screen.getByText("Supabase")).toBeInTheDocument();
    // The "More tools" tile still surfaces the count so the user can see
    // at a glance how many extras are wired up.
    expect(screen.getByText(/2 connected/)).toBeInTheDocument();
  });

  it("shows a 'Select Google Ads account' sub-action when the MCP is connected but no account is picked", async () => {
    getConnectStepStateAction.mockResolvedValue({
      ok: true,
      state: {
        googleads: { connected: true, account_selected: false },
        metaads: { connected: false, account_selected: false },
        gsc: { connected: false, account_selected: false },
        extras: [],
        extra_connected_count: 0,
        website_url: null,
      },
    });
    setStep("connect", "acme");
    render(<OnboardingFlow />);
    const pick = await screen.findByRole("button", {
      name: /Select Google Ads account/i,
    });
    fireEvent.click(pick);
    expect(routerPush).toHaveBeenCalledWith(
      "/onboarding?step=account&slug=acme",
    );
  });
});

describe("OnboardingFlow — SetupStep", () => {
  it("renders the per-template checklist while provisioning runs", async () => {
    getProvisioningProgressAction.mockResolvedValue({
      ok: true,
      overall: "running",
      steps: [
        { key: "cmo", label: "Setting up CMO", status: "in_progress" },
        {
          key: "google_ads",
          label: "Setting up Google Ads Specialist",
          status: "pending",
        },
        {
          key: "gateway",
          label: "Connecting agents to gateway",
          status: "pending",
        },
      ],
    });
    setStep("setup", "acme");
    render(<OnboardingFlow />);
    expect(
      await screen.findByText(/Setting up CMO/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Setting up Google Ads Specialist/i)).toBeInTheDocument();
    expect(screen.getByText(/Connecting agents to gateway/i)).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("redirects to the task workspace once provisioning is done", async () => {
    getProvisioningProgressAction.mockResolvedValue({
      ok: true,
      overall: "done",
      steps: [
        { key: "cmo", label: "Setting up CMO", status: "done" },
        {
          key: "google_ads",
          label: "Setting up Google Ads Specialist",
          status: "done",
        },
        {
          key: "gateway",
          label: "Connecting agents to gateway",
          status: "done",
        },
      ],
    });
    getOnboardingTaskForSkipAction.mockResolvedValue({
      ok: true,
      task_display_id: "acme-1",
      cmo_agent_slug: "cmo-greg",
    });
    setStep("setup", "acme");
    render(<OnboardingFlow />);
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        "/acme/agents/cmo-greg/tasks?task=acme-1",
      ),
    );
  });

  it("surfaces an error when provisioning fails", async () => {
    getProvisioningProgressAction.mockResolvedValue({
      ok: true,
      overall: "failed",
      steps: [
        {
          key: "cmo",
          label: "Setting up CMO",
          status: "failed",
          error: "openclaw agents add failed",
        },
        {
          key: "google_ads",
          label: "Setting up Google Ads Specialist",
          status: "pending",
        },
        {
          key: "gateway",
          label: "Connecting agents to gateway",
          status: "pending",
        },
      ],
    });
    setStep("setup", "acme");
    render(<OnboardingFlow />);
    await waitFor(() =>
      expect(
        screen.getAllByText(/openclaw agents add failed/i).length,
      ).toBeGreaterThan(0),
    );
    // The failing row stays visible (red status icon) and a top-level
    // error alert summarises the failure so it can't be missed.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /openclaw agents add failed/i,
    );
  });
});

describe("OnboardingFlow — AccountStep", () => {
  it("shows a loading card while listGoogleAdsAccounts is pending", () => {
    listGoogleAdsAccounts.mockReturnValue(new Promise(() => {}));
    setStep("account", "acme");
    render(<OnboardingFlow />);
    expect(
      screen.getByText(/Loading your Google Ads accounts/i),
    ).toBeInTheDocument();
  });

  it("renders an error card with retry + skip when listGoogleAdsAccounts fails", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: false,
      kind: "rpc",
      error: "HTTP 500",
    });
    setStep("account", "acme");
    render(<OnboardingFlow />);
    expect(
      await screen.findByText(/Couldn.t load your Google Ads accounts/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Retry from start/i }),
    ).toHaveAttribute("href", "/onboarding");
    expect(
      screen.getByRole("link", { name: /Skip to project/i }),
    ).toHaveAttribute("href", "/acme");
  });

  it("renders the no-accounts state with reconnect link when the list is empty", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [],
      default_account_id: null,
    });
    setStep("account", "acme");
    render(<OnboardingFlow />);
    expect(
      await screen.findByText(/No Google Ads accounts found/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Reconnect/i }),
    ).toHaveAttribute(
      "href",
      "/onboarding?step=connect&slug=acme",
    );
  });

  it("auto-selects the only account and routes back to the connect step", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [{ id: "123-456-7890", name: "Solo Account" }],
      default_account_id: "123-456-7890",
    });
    setOnboardingAccountAction.mockResolvedValue({
      ok: true,
      project: {},
      task_display_id: "AUDIT-1",
      cmo_agent_slug: "cmo-greg",
    });
    setStep("account", "acme");
    render(<OnboardingFlow />);
    await waitFor(() =>
      expect(setOnboardingAccountAction).toHaveBeenCalledWith("acme", "123-456-7890"),
    );
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        "/onboarding?step=connect&slug=acme",
      ),
    );
  });

  it("falls back to the error state when auto-select setOnboardingAccountAction fails", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [{ id: "1", name: "Solo" }],
      default_account_id: null,
    });
    setOnboardingAccountAction.mockResolvedValue({
      ok: false,
      error: "permission denied",
    });
    setStep("account", "acme");
    render(<OnboardingFlow />);
    expect(
      await screen.findByText(/Couldn.t load your Google Ads accounts/i),
    ).toBeInTheDocument();
    expect(toastFns.error).toHaveBeenCalledWith("permission denied");
  });

  it("renders the picker with a 'default' badge when multiple accounts are returned", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [
        { id: "111", name: "Alpha" },
        { id: "222", name: "Bravo" },
      ],
      default_account_id: "222",
    });
    setStep("account", "acme");
    render(<OnboardingFlow />);
    expect(
      await screen.findByRole("heading", { name: /Which Google Ads account/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText(/Customer ID 111/)).toBeInTheDocument();
    expect(screen.getByText(/Customer ID 222/)).toBeInTheDocument();
  });

  it("picks the chosen account and routes back to the connect step", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [
        { id: "111", name: "Alpha" },
        { id: "222", name: "Bravo" },
      ],
      default_account_id: null,
    });
    setOnboardingAccountAction.mockResolvedValue({
      ok: true,
      project: {},
      task_display_id: "TASK-9",
      cmo_agent_slug: "cmo-greg",
    });
    setStep("account", "acme");
    render(<OnboardingFlow />);
    const alphaBtn = await screen.findByRole("button", {
      name: /Audit Alpha \(111\)/,
    });
    fireEvent.click(alphaBtn);
    await waitFor(() =>
      expect(setOnboardingAccountAction).toHaveBeenCalledWith("acme", "111"),
    );
    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        "/onboarding?step=connect&slug=acme",
      ),
    );
  });

  it("toasts and re-enables the pick buttons when setOnboardingAccountAction returns ok=false", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [
        { id: "111", name: "Alpha" },
        { id: "222", name: "Bravo" },
      ],
      default_account_id: null,
    });
    setOnboardingAccountAction.mockResolvedValue({
      ok: false,
      error: "boom",
    });
    setStep("account", "acme");
    render(<OnboardingFlow />);
    const alphaBtn = await screen.findByRole("button", {
      name: /Audit Alpha/,
    });
    fireEvent.click(alphaBtn);
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith("boom"));
    expect(alphaBtn).not.toBeDisabled();
  });

  it("toasts the thrown error when onPick throws", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [
        { id: "111", name: "Alpha" },
        { id: "222", name: "Bravo" },
      ],
      default_account_id: null,
    });
    setOnboardingAccountAction.mockRejectedValue(new Error("network"));
    setStep("account", "acme");
    render(<OnboardingFlow />);
    const alphaBtn = await screen.findByRole("button", {
      name: /Audit Alpha/,
    });
    fireEvent.click(alphaBtn);
    await waitFor(() => expect(toastFns.error).toHaveBeenCalledWith("network"));
  });

  it("disables all picker buttons while one selection is in flight", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [
        { id: "111", name: "Alpha" },
        { id: "222", name: "Bravo" },
      ],
      default_account_id: null,
    });
    let resolve: (v: { ok: true; project: object; task_display_id: string }) => void = () => {};
    setOnboardingAccountAction.mockImplementation(
      () =>
        new Promise<{ ok: true; project: object; task_display_id: string }>(
          (res) => {
            resolve = res;
          },
        ),
    );
    setStep("account", "acme");
    render(<OnboardingFlow />);
    const alphaBtn = await screen.findByRole("button", {
      name: /Audit Alpha/,
    });
    const bravoBtn = screen.getByRole("button", { name: /Audit Bravo/ });
    fireEvent.click(alphaBtn);
    await waitFor(() => expect(alphaBtn).toBeDisabled());
    expect(bravoBtn).toBeDisabled();
    act(() => {
      resolve({ ok: true, project: {}, task_display_id: "TASK-1" });
    });
  });

  it("renders the auto-select loading card when exactly one account exists", async () => {
    listGoogleAdsAccounts.mockResolvedValue({
      ok: true,
      accounts: [{ id: "1", name: "Solo" }],
      default_account_id: null,
    });
    // setOnboardingAccountAction never resolves: keeps the auto-select card visible.
    setOnboardingAccountAction.mockReturnValue(new Promise(() => {}));
    setStep("account", "acme");
    render(<OnboardingFlow />);
    expect(
      await screen.findByText(/Using your only Google Ads account/i),
    ).toBeInTheDocument();
  });
});
