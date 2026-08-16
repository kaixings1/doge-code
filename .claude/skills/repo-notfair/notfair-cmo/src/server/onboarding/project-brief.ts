import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * PROJECT.md — the single source of truth for "what is this project / who
 * is the company / what does the CMO know about it". Written once by the
 * CMO during the first onboarding task, then propagated into every agent's
 * IDENTITY.md so all specialists share the same context.
 *
 * Path layout (relative to the data dir, default ~/.notfair-cmo):
 *
 *   projects/<slug>/PROJECT.md  — canonical, edited by the CMO
 *
 * Per-agent copies live in each agent's workspace and are written by
 * `writeIdentityFile` so a human inspecting the workspace can see what the
 * agent actually has. The IDENTITY.md prompt inlines the same content
 * under a `## Project context` heading so it lands in the system prompt
 * regardless of which files OpenClaw chooses to load.
 */

/** Hard cap on PROJECT.md body size — keeps system prompts bounded. */
export const PROJECT_BRIEF_MAX_BYTES = 64 * 1024;

function dataDir(): string {
  return process.env.NOTFAIR_CMO_DATA_DIR ?? join(homedir(), ".notfair-cmo");
}

export function projectBriefDir(project_slug: string): string {
  return join(dataDir(), "projects", project_slug);
}

export function projectBriefPath(project_slug: string): string {
  return join(projectBriefDir(project_slug), "PROJECT.md");
}

/**
 * Return the current PROJECT.md body for a project, or null when none has
 * been written yet. Errors (other than ENOENT) bubble up so callers can
 * surface fs problems instead of silently treating them as "no brief".
 */
export async function readProjectBrief(
  project_slug: string,
): Promise<string | null> {
  try {
    return await readFile(projectBriefPath(project_slug), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Persist a new PROJECT.md body to the canonical path. Idempotent — calling
 * with the same body is a no-op rewrite. Does NOT propagate to agent
 * workspaces; that's the caller's job (see set_project_brief handler).
 */
export async function writeProjectBrief(
  project_slug: string,
  body: string,
): Promise<void> {
  const path = projectBriefPath(project_slug);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

/**
 * Remove the canonical PROJECT.md directory for a project — called from
 * the project-delete cascade so we don't orphan briefs on disk. Without
 * this, recreating a project with the same slug would inherit the prior
 * tenant's brief (writeIdentityFile reads PROJECT.md if it exists).
 *
 * Best-effort: missing dir is a no-op, other fs errors propagate so the
 * caller can decide whether to surface them.
 */
export async function deleteProjectBriefDir(
  project_slug: string,
): Promise<void> {
  await rm(projectBriefDir(project_slug), { recursive: true, force: true });
}

/**
 * Move the canonical PROJECT.md directory when a project's slug changes.
 * Called by the rename cascade in changeProjectSlug. No-op when the
 * source dir doesn't exist (project never had a brief written). Throws
 * if the destination already exists — that would be a slug-collision
 * higher up the call chain that we should not silently paper over.
 */
export async function renameProjectBriefDir(
  old_slug: string,
  new_slug: string,
): Promise<void> {
  if (old_slug === new_slug) return;
  const from = projectBriefDir(old_slug);
  try {
    await stat(from);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  const to = projectBriefDir(new_slug);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
}
