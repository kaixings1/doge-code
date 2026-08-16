"use server";

import { existsSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { getActiveProject } from "@/server/active-project";
import {
  disableCron,
  listCronsForProject,
  removeCron,
} from "@/server/scheduler/display";
import {
  agentExistsInProject,
  cascadeDeleteAgent,
  cloneAgent,
  type CloneAgentResult,
} from "@/server/agents/clone";
import {
  workspaceDirFor,
  provisionAgent,
} from "@/server/agents/provisioning";
import {
  readAgentMeta,
  writeAgentMeta,
  listProjectAgents,
  type AgentMeta,
  type ProjectAgentEntry,
} from "@/server/agent-meta";
import { listSessionsForAgent } from "@/server/sessions/view";
import { slugify } from "@/lib/slug";
import { getProject } from "@/server/db/projects";
import { DEFAULT_HARNESS_ADAPTER } from "@/server/adapters/registry";
import type { AgentTemplate } from "@/server/agent-templates";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AgentChoice = {
  agent_id: string;
  display_name: string;
  in_current_project: boolean;
};

/**
 * Previously listed every agent across the OpenClaw config. With the harness-
 * adapter model there's no global agent registry — agents live per-project in
 * notfair-cmo's data dir. We surface the active project's roster only.
 */
export async function listOpenClawAgentsAction(): Promise<ActionResult<AgentChoice[]>> {
  const project = await getActiveProject();
  if (!project) return { ok: true, data: [] };
  try {
    const entries = await listProjectAgents(project.slug);
    return {
      ok: true,
      data: entries.map((e) => ({
        agent_id: e.agent_id,
        display_name: e.name,
        in_current_project: true,
      })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listProjectAgentsAction(): Promise<ActionResult<ProjectAgentEntry[]>> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };
  try {
    return { ok: true, data: await listProjectAgents(project.slug) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type CreateAgentInput = { display_name: string };

export async function createAgentAction(
  input: CreateAgentInput,
): Promise<ActionResult<{ agent_id: string; slug: string }>> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };
  const slug = slugify(input.display_name);
  if (!slug.ok) return { ok: false, error: `Invalid name: ${slug.reason}` };

  if (agentExistsInProject(project.slug, slug.slug)) {
    return {
      ok: false,
      error: `An agent named "${slug.slug}" already exists in this project.`,
    };
  }

  const agentId = `${project.slug}-${slug.slug}`;
  const harness = project.harness_adapter ?? DEFAULT_HARNESS_ADAPTER;

  try {
    await provisionAgent({
      projectSlug: project.slug,
      agentId,
      displayName: input.display_name.trim(),
      templateKey: "custom",
      identityMd: `# ${input.display_name.trim()}\n\nCustom agent. Edit IDENTITY.md to define this agent's role.\n`,
      harnessAdapter: harness,
    });
    await writeAgentMeta({
      agent_id: agentId,
      project_slug: project.slug,
      slug: slug.slug,
      name: input.display_name.trim(),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { agent_id: agentId, slug: slug.slug } };
}

export type CloneAgentActionInput = {
  source_agent_id: string;
  new_display_name: string;
  new_slug?: string;
};

export async function cloneAgentAction(
  input: CloneAgentActionInput,
): Promise<ActionResult<CloneAgentResult>> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };

  const slugSource = (input.new_slug ?? input.new_display_name).trim();
  if (!slugSource) {
    return { ok: false, error: "Please provide a name for the cloned agent." };
  }
  try {
    const result = await cloneAgent({
      source_agent_id: input.source_agent_id,
      project_slug: project.slug,
      new_slug: slugSource,
      display_name: input.new_display_name,
    });
    revalidatePath("/", "layout");
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function disableCronsAction(
  cronIds: string[],
): Promise<ActionResult<{ disabled: number; failed: number }>> {
  let disabled = 0;
  let failed = 0;
  for (const id of cronIds) {
    try {
      await disableCron(id);
      disabled++;
    } catch {
      failed++;
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { disabled, failed } };
}

// --- Relocate ---

export type RelocateAgentInput = {
  old_agent_id: string;
  source_project_slug: string;
  new_project_slug: string;
  new_slug: string;
  new_display_name: string;
  preserve_template_key?: AgentTemplate["key"];
  preserve_source_agent_id?: string;
  preserve_created_at?: string;
};

export type RelocateAgentResult = {
  new_agent_id: string;
  new_slug: string;
};

export async function relocateAgent(
  input: RelocateAgentInput,
): Promise<RelocateAgentResult> {
  const cloneResult = await cloneAgent({
    source_agent_id: input.old_agent_id,
    project_slug: input.new_project_slug,
    new_slug: input.new_slug,
    display_name: input.new_display_name,
    slug_is_canonical: true,
  });

  const isTemplateAgent = !!input.preserve_template_key;
  await writeAgentMeta({
    agent_id: cloneResult.new_agent_id,
    project_slug: input.new_project_slug,
    ...(isTemplateAgent ? {} : { slug: cloneResult.new_slug }),
    name: input.new_display_name,
    ...(input.preserve_template_key ? { template_key: input.preserve_template_key } : {}),
    ...(input.preserve_source_agent_id
      ? { source_agent_id: input.preserve_source_agent_id }
      : {}),
    created_at: input.preserve_created_at ?? new Date().toISOString(),
  });

  await cascadeDeleteAgent(input.old_agent_id, input.source_project_slug).catch(() => {});

  return {
    new_agent_id: cloneResult.new_agent_id,
    new_slug: cloneResult.new_slug,
  };
}

// --- Rename ---

export type RenameAgentInput = {
  agent_id: string;
  new_display_name: string;
};

export type RenameAgentData = {
  agent_id: string;
  slug: string;
  display_name: string;
  full_rename: boolean;
};

export async function renameAgentAction(
  _input: RenameAgentInput,
): Promise<ActionResult<RenameAgentData>> {
  return {
    ok: false,
    error: "Agents are immutable once created. To use a different name, clone the agent and delete the original.",
  };
}

// --- Per-agent deletion ---

export type AgentDeletionSummary = {
  agent_id: string;
  display_name: string;
  exists_in_openclaw: boolean;
  threads: Array<{ session_id: string; label: string; last_interaction_at: number }>;
  crons: Array<{ id: string; name: string; disabled: boolean }>;
  source_agent_id?: string;
  template_key?: string;
};

export async function getAgentDeletionSummaryAction(
  agent_id: string,
): Promise<ActionResult<AgentDeletionSummary>> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };

  const meta: AgentMeta | null = readAgentMeta(agent_id);
  const agentDir = workspaceDirFor(agent_id);
  const exists = existsSync(agentDir);
  const sessions = exists ? listSessionsForAgent(project.slug, agent_id) : [];
  const threads = sessions.map((s) => ({
    session_id: s.sessionId,
    label: s.label,
    last_interaction_at: s.lastInteractionAt,
  }));

  const crons: Array<{ id: string; name: string; disabled: boolean }> = [];
  try {
    const view = await listCronsForProject(project.slug);
    for (const g of view.groups) {
      for (const c of g.crons) {
        if (c.agent_id !== agent_id) continue;
        crons.push({ id: c.id, name: c.short_name || c.name, disabled: c.disabled });
      }
    }
  } catch {
    // best-effort
  }

  return {
    ok: true,
    data: {
      agent_id,
      display_name: meta?.name ?? agent_id,
      // field kept for UI compatibility — true when the workspace exists
      exists_in_openclaw: exists,
      threads,
      crons,
      source_agent_id: meta?.source_agent_id,
      template_key: meta?.template_key,
    },
  };
}

export type DeleteAgentData = {
  agent_id: string;
  crons_removed: number;
  crons_failed: number;
  openclaw_deleted: boolean;
  meta_removed: boolean;
};

export type CascadeAgentDeleteOutcome = DeleteAgentData;

export async function deleteAgentCascadeAction(
  agent_id: string,
): Promise<ActionResult<DeleteAgentData>> {
  const project = await getActiveProject();
  if (!project) return { ok: false, error: "No active project." };

  let cronsRemoved = 0;
  let cronsFailed = 0;
  try {
    const view = await listCronsForProject(project.slug);
    for (const g of view.groups) {
      for (const c of g.crons) {
        if (c.agent_id !== agent_id) continue;
        try {
          await removeCron(c.id);
          cronsRemoved++;
        } catch {
          cronsFailed++;
        }
      }
    }
  } catch {
    // best-effort
  }

  try {
    await cascadeDeleteAgent(agent_id, project.slug);
  } catch (err) {
    return {
      ok: false,
      error: `Failed to delete agent: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      agent_id,
      crons_removed: cronsRemoved,
      crons_failed: cronsFailed,
      openclaw_deleted: true,
      meta_removed: true,
    },
  };
}
