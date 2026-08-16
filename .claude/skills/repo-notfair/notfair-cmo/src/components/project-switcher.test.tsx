// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const pathnameRef: { current: string } = { current: "/proj-a/agents/cmo/tasks" };
const router = {
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathnameRef.current,
}));

const switchProjectAction = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock("@/server/actions/projects", () => ({
  switchProjectAction: (...args: unknown[]) => switchProjectAction(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toast.success(...args),
    error: (...args: unknown[]) => toast.error(...args),
  },
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenuButton: ({ children, ...rest }: { children: React.ReactNode }) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
}));

import { ProjectSwitcher } from "./project-switcher";

function openMenu() {
  const trigger = screen.getByRole("button");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
}

const projects = [
  { id: "1", slug: "proj-a", display_name: "Alpha", created_at: "", archived_at: null, google_ads_account_id: null, website_url: null, codebase_path: null },
  { id: "2", slug: "proj-b", display_name: "Beta", created_at: "", archived_at: null, google_ads_account_id: null, website_url: null, codebase_path: null },
];

beforeEach(() => {
  switchProjectAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  router.push.mockReset();
  router.refresh.mockReset();
  pathnameRef.current = "/proj-a/agents/cmo/tasks";
});

afterEach(() => {
  cleanup();
});

describe("ProjectSwitcher", () => {
  it("shows the active project display name (and not the slug)", () => {
    render(<ProjectSwitcher projects={projects} activeSlug="proj-a" />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    // The slug subtitle was redundant — only the avatar + display name
    // render in the trigger now.
    expect(screen.queryByText("proj-a")).not.toBeInTheDocument();
  });

  it("falls back to placeholder text when no project is active", () => {
    render(<ProjectSwitcher projects={[]} activeSlug={null} />);
    expect(screen.getByText("No workspace")).toBeInTheDocument();
  });

  it("shows the project initials in the avatar", () => {
    render(<ProjectSwitcher projects={projects} activeSlug="proj-a" />);
    expect(screen.getAllByText("AL").length).toBeGreaterThan(0);
  });

  it("renders a 'New workspace' link to /onboarding", () => {
    render(<ProjectSwitcher projects={projects} activeSlug="proj-a" />);
    openMenu();
    expect(screen.getByText("New workspace")).toBeInTheDocument();
  });

  it("opens the menu and lists all projects", () => {
    render(<ProjectSwitcher projects={projects} activeSlug="proj-a" />);
    openMenu();
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("switches projects when picking a non-active item", async () => {
    switchProjectAction.mockResolvedValue({ ok: true });
    render(<ProjectSwitcher projects={projects} activeSlug="proj-a" />);
    openMenu();
    fireEvent.click(screen.getByText("Beta"));
    await waitFor(() => expect(switchProjectAction).toHaveBeenCalledWith("proj-b"));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/proj-b/agents/cmo/tasks"),
    );
  });

  it("does not call switchProject when picking the active project", () => {
    render(<ProjectSwitcher projects={projects} activeSlug="proj-a" />);
    openMenu();
    const items = screen.getAllByText("Alpha");
    const item = items[items.length - 1];
    fireEvent.click(item);
    expect(switchProjectAction).not.toHaveBeenCalled();
  });

  it("toasts the error when switchProjectAction fails", async () => {
    switchProjectAction.mockResolvedValue({ ok: false, error: "nope" });
    render(<ProjectSwitcher projects={projects} activeSlug="proj-a" />);
    openMenu();
    fireEvent.click(screen.getByText("Beta"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("nope"));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows 'No workspaces yet' when projects list is empty", () => {
    render(<ProjectSwitcher projects={[]} activeSlug={null} />);
    openMenu();
    expect(screen.getByText("No workspaces yet")).toBeInTheDocument();
  });
});
