import { cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { slugify } from "@/lib/slug";
import { workspaceDirFor } from "@/server/agents/provisioning";
import { writeAgentMeta, readAgentMeta } from "@/server/agent-meta";
import { getDb } from "@/server/db/db";
import {
  listAgentScheduledJobs,
  createScheduledJob,
} from "@/server/scheduler";

export interface CloneAgentInput {
  source_agent_id: string;
  project_slug: string;
  new_slug: string;
  display_name?: string;
  /** Skip the user-input slug validation (relocate/internal callers). */
  slug_is_canonical?: boolean;
}

export interface CloneSourceCron {
  id: string;
  name: string;
  disabled: boolean;
}

export interface CloneAgentResult {
  new_agent_id: string;
  new_slug: string;
  files_copied: number;
  sessions_copied: number;
  source_crons: CloneSourceCron[];
  new_cron_ids: string[];
}

/**
 * Clone an existing agent within a project.
 *
 * Workspace dir copy via fs `cp -r`, scheduled jobs duplicated as new rows,
 * sessions / transcript_events left ON the source (we don't carry chat history
 * forward — the new agent starts with an empty thread list).
 */
export async function cloneAgent(input: CloneAgentInput): Promise<CloneAgentResult> {
  let newSlug: string;
  if (input.slug_is_canonical) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.new_slug)) {
      throw new Error(`Invalid canonical slug: ${input.new_slug}`);
    }
    newSlug = input.new_slug;
  } else {
    const slugResult = slugify(input.new_slug);
    if (!slugResult.ok) {
      throw new Error(`Invalid agent slug: ${slugResult.reason}`);
    }
    newSlug = slugResult.slug;
  }
  const newAgentId = `${input.project_slug}-${newSlug}`;
  if (agentExistsInProject(input.project_slug, newSlug)) {
    throw new Error(
      `An agent named "${newSlug}" already exists in this project. Pick a different name.`,
    );
  }

  const srcDir = workspaceDirFor(input.source_agent_id);
  const dstDir = workspaceDirFor(newAgentId);
  let filesCopied = 0;
  if (existsSync(srcDir)) {
    await cp(srcDir, dstDir, { recursive: true });
    filesCopied = 1; // we don't enumerate; the dir is intact
  }

  // Clone scheduled jobs.
  const srcJobs = listAgentScheduledJobs(input.project_slug, input.source_agent_id);
  const sourceCrons: CloneSourceCron[] = srcJobs.map((j) => ({
    id: j.id,
    name: j.name,
    disabled: j.enabled === 0,
  }));
  const newCronIds: string[] = [];
  for (const j of srcJobs) {
    try {
      const cloned = createScheduledJob({
        project_slug: input.project_slug,
        agent_id: newAgentId,
        name: j.name,
        cron_expr: j.cron_expr,
        message: j.message,
        enabled: j.enabled === 1,
      });
      newCronIds.push(cloned.id);
    } catch (err) {
      console.error("[clone] failed to copy cron:", err);
    }
  }

  const displayName = (input.display_name ?? input.source_agent_id).trim() || input.source_agent_id;
  const sourceMeta = readAgentMeta(input.source_agent_id);
  await writeAgentMeta({
    agent_id: newAgentId,
    project_slug: input.project_slug,
    slug: newSlug,
    name: displayName,
    source_agent_id: input.source_agent_id,
    template_key: sourceMeta?.template_key,
    created_at: new Date().toISOString(),
  });

  return {
    new_agent_id: newAgentId,
    new_slug: newSlug,
    files_copied: filesCopied,
    // sessions deliberately not copied — new agent starts fresh
    sessions_copied: 0,
    source_crons: sourceCrons,
    new_cron_ids: newCronIds,
  };
}

export function agentExistsInProject(project_slug: string, slug: string): boolean {
  const agentId = `${project_slug}-${slug}`;
  const dir = workspaceDirFor(agentId);
  if (!existsSync(dir)) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    return readdirSync(dir).length > 0;
  } catch {
    return true;
  }
}

/** Cascade-delete an agent's workspace + sessions + scheduled jobs. */
export async function cascadeDeleteAgent(agent_id: string, project_slug: string): Promise<void> {
  const dir = workspaceDirFor(agent_id);
  const { rm } = await import("node:fs/promises");
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }
  getDb()
    .prepare("DELETE FROM scheduled_jobs WHERE project_slug = ? AND agent_id = ?")
    .run(project_slug, agent_id);
  getDb()
    .prepare("DELETE FROM sessions WHERE project_slug = ? AND agent_id = ?")
    .run(project_slug, agent_id);
}

void randomUUID; // imported for future use (sessions cloning if we re-enable)
