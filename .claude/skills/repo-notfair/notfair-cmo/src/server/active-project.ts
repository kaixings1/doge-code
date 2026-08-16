import { cookies } from "next/headers";
import { getProject, listProjects } from "./db/projects";
import type { Project } from "@/types";

const COOKIE_NAME = "notfair_active_project";

export async function getActiveProject(): Promise<Project | null> {
  const c = await cookies();
  const slug = c.get(COOKIE_NAME)?.value;
  if (slug) {
    const p = getProject(slug);
    if (p && !p.archived_at) return p;
  }
  // Fall back to the first non-archived project, if any.
  const all = listProjects();
  return all[0] ?? null;
}

export async function setActiveProject(slug: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE_NAME, slug, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveProject(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}
