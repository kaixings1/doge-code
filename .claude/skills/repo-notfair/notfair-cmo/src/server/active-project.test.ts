import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/types";

// ── Mocks ──────────────────────────────────────────────────────────

const cookieGetMock = vi.fn();
const cookieSetMock = vi.fn();
const cookieDeleteMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (...args: unknown[]) => cookieGetMock(...args),
    set: (...args: unknown[]) => cookieSetMock(...args),
    delete: (...args: unknown[]) => cookieDeleteMock(...args),
  }),
}));

const getProjectMock = vi.fn();
const listProjectsMock = vi.fn();
vi.mock("./db/projects", () => ({
  getProject: (...args: unknown[]) => getProjectMock(...args),
  listProjects: (...args: unknown[]) => listProjectsMock(...args),
}));

import {
  clearActiveProject,
  getActiveProject,
  setActiveProject,
} from "./active-project";

// ── Fixtures ───────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "uuid",
    slug: "acme",
    display_name: "Acme",
    created_at: "now",
    archived_at: null,
    google_ads_account_id: null,
    website_url: null,
    codebase_path: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("getActiveProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the cookie-pinned project when it exists and is not archived", async () => {
    cookieGetMock.mockReturnValueOnce({ value: "acme" });
    const acme = makeProject({ slug: "acme" });
    getProjectMock.mockReturnValueOnce(acme);

    const r = await getActiveProject();
    expect(r).toEqual(acme);
    expect(getProjectMock).toHaveBeenCalledWith("acme");
    expect(listProjectsMock).not.toHaveBeenCalled();
  });

  it("falls back to first listProjects result when cookie absent", async () => {
    cookieGetMock.mockReturnValueOnce(undefined);
    const first = makeProject({ slug: "first" });
    listProjectsMock.mockReturnValueOnce([first, makeProject({ slug: "other" })]);

    const r = await getActiveProject();
    expect(r).toEqual(first);
    expect(getProjectMock).not.toHaveBeenCalled();
  });

  it("falls back when cookie present but project no longer exists", async () => {
    cookieGetMock.mockReturnValueOnce({ value: "ghost" });
    getProjectMock.mockReturnValueOnce(null);
    const fallback = makeProject({ slug: "fallback" });
    listProjectsMock.mockReturnValueOnce([fallback]);

    const r = await getActiveProject();
    expect(r).toEqual(fallback);
  });

  it("falls back when cookie-pinned project is archived", async () => {
    cookieGetMock.mockReturnValueOnce({ value: "old" });
    const archived = makeProject({
      slug: "old",
      archived_at: "2025-01-01T00:00:00Z",
    });
    getProjectMock.mockReturnValueOnce(archived);
    const fallback = makeProject({ slug: "fresh" });
    listProjectsMock.mockReturnValueOnce([fallback]);

    const r = await getActiveProject();
    expect(r).toEqual(fallback);
  });

  it("returns null when cookie absent and no projects exist", async () => {
    cookieGetMock.mockReturnValueOnce(undefined);
    listProjectsMock.mockReturnValueOnce([]);

    const r = await getActiveProject();
    expect(r).toBeNull();
  });

  it("returns null when cookie present but no projects exist", async () => {
    cookieGetMock.mockReturnValueOnce({ value: "ghost" });
    getProjectMock.mockReturnValueOnce(null);
    listProjectsMock.mockReturnValueOnce([]);

    const r = await getActiveProject();
    expect(r).toBeNull();
  });
});

describe("setActiveProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the cookie with the notfair_active_project name and httpOnly options", async () => {
    await setActiveProject("acme");
    expect(cookieSetMock).toHaveBeenCalledTimes(1);
    const [name, value, opts] = cookieSetMock.mock.calls[0]!;
    expect(name).toBe("notfair_active_project");
    expect(value).toBe("acme");
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    expect(opts.maxAge).toBeGreaterThan(0);
  });

  it("persists the maxAge as one year in seconds", async () => {
    await setActiveProject("acme");
    const [, , opts] = cookieSetMock.mock.calls[0]!;
    expect(opts.maxAge).toBe(60 * 60 * 24 * 365);
  });

  it("accepts a different slug verbatim", async () => {
    await setActiveProject("acme-q4");
    const [, value] = cookieSetMock.mock.calls[0]!;
    expect(value).toBe("acme-q4");
  });
});

describe("clearActiveProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the notfair_active_project cookie", async () => {
    await clearActiveProject();
    expect(cookieDeleteMock).toHaveBeenCalledWith("notfair_active_project");
  });
});
