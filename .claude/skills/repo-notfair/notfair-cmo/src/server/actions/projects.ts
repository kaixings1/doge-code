"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  archiveProject,
  changeProjectSlug,
  createProject,
  deleteProjectRow,
  getProject,
  renameProject,
} from "@/server/db/projects";
import { slugify } from "@/lib/slug";
import {
  clearActiveProject,
  setActiveProject,
} from "@/server/active-project";
import {
  DEFAULT_ONBOARDING_TEMPLATE_KEYS,
  ensureProjectAgents,
} from "@/server/agent-templates";
import { startProvisioning } from "@/server/onboarding/provisioning-state";
import { listProjectAgents, readAgentMeta } from "@/server/agent-meta";
import { relocateAgent } from "@/server/actions/agents";
import { listCronsForProject, disableCron } from "@/server/scheduler/display";
import { logAgentAction } from "@/server/db/agent-actions";
import {
  cascadeDeleteProjectArtifacts,
  getProjectDeletionSummary,
  type ProjectDeletionSummary,
} from "@/server/agents/cascade-delete";
import { clearProvisioning } from "@/server/onboarding/provisioning-state";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Throws on validation failure so form action signature is `(formData) => Promise<void>`.
// Pages can render `error.tsx` for fallback; for inline UI feedback, wire `useActionState`
// in a client wrapper later if needed.
export async function createProjectAction(formData: FormData): Promise<void> {
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) throw new Error("Please enter a workspace name.");

  const result = createProject({ display_name });
  if (!result.ok) throw new Error(result.reason);

  // Per D6: provision CMO + Google Ads asynchronously so the form returns
  // immediately. The audit step (after OAuth) gates on completion via
  // `awaitProvisioning` from server/onboarding/provisioning-state.
  // Per D4: scope to the default onboarding bundle (SEO is opt-in later).
  // DEFAULT_ONBOARDING_TEMPLATE_KEYS is the single source of truth — also
  // consulted by listProjectAgents to decide which template placeholders
  // appear in the sidebar before disk writes finish.
  const provisionPromise = ensureProjectAgents(
    result.project.slug,
    DEFAULT_ONBOARDING_TEMPLATE_KEYS,
  );
  startProvisioning(result.project.slug, provisionPromise);
  // Log on completion (best-effort, doesn't block form return).
  provisionPromise
    .then((prov) => {
      logAgentAction({
        project_slug: result.project.slug,
        agent_id: "system",
        action_type: "project_created",
        summary: `Project '${result.project.display_name}' created. ${prov.created.length} agents provisioned${prov.failed.length > 0 ? `, ${prov.failed.length} failed` : ""}.`,
        payload: prov,
      });
    })
    .catch((err) => {
      console.error("Agent provisioning failed; project created but no agents:", err);
    });

  await setActiveProject(result.project.slug);
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Onboarding-flow variant of createProjectAction. Same create + async
 * provision (D6) but returns the slug to the caller instead of redirecting
 * to /. The client navigates to ?step=connect&slug=... after success.
 *
 * Also creates and starts the CMO's first task ("Learn the project and
 * write PROJECT.md") in the background so it runs in parallel with the
 * user doing OAuth. The downstream Google Ads audit task (minted in
 * setOnboardingAccountAction) gates on this one via blocked_by_task_id.
 */
export async function createProjectForOnboardingAction(
  formData: FormData,
): Promise<ActionResult<{ slug: string; display_name: string }>> {
  const display_name = String(formData.get("display_name") ?? "").trim();
  if (!display_name) return { ok: false, error: "Please enter a workspace name." };

  const website_url = String(formData.get("website_url") ?? "").trim() || null;
  const codebase_path = String(formData.get("codebase_path") ?? "").trim() || null;
  const harness_raw = String(formData.get("harness_adapter") ?? "").trim();
  const { isHarnessAdapterId, DEFAULT_HARNESS_ADAPTER } = await import(
    "@/server/adapters/registry"
  );
  const harness_adapter = isHarnessAdapterId(harness_raw)
    ? harness_raw
    : DEFAULT_HARNESS_ADAPTER;

  const result = createProject({
    display_name,
    website_url,
    codebase_path,
    harness_adapter,
  });
  if (!result.ok) return { ok: false, error: result.reason };

  // Mint the onboarding task SYNCHRONOUSLY — before provisioning kicks
  // off — so the task row (and its display_id, e.g. `demo3-1`) exists
  // immediately. If the user races through OAuth and lands on
  // setOnboardingAccountAction before provisioning resolves, that flow
  // can still find this task by title and set blocked_by_task_id
  // correctly. Kickoff (which needs the OpenClaw agent to exist) is
  // deferred to the provisionPromise.then() below.
  //
  // Agent personal names are no longer user-configurable at onboarding —
  // we use the template defaults ("Greg" for CMO, "Ana" for Google Ads).
  // Letting users pick once-and-only-once at onboarding was a footgun
  // since agent_ids encode the name and are immutable; if we ever add a
  // proper rename feature (with cascade) it'll live in settings, not
  // here.
  const { agentNameFor, templateForKey } = await import("@/server/agent-templates");
  const cmoName = templateForKey("cmo")?.default_name ?? "Greg";
  const cmoAgentId = agentNameFor(result.project.slug, "cmo", cmoName);
  const { buildProjectOnboardingBrief } = await import(
    "@/server/onboarding/cmo-task-brief"
  );
  const { createTask } = await import("@/server/db/tasks");
  const { title, brief, success_criteria } = buildProjectOnboardingBrief({
    project_slug: result.project.slug,
    project_display_name: result.project.display_name,
    website_url,
    codebase_path,
  });
  const onboardingTask = createTask({
    project_slug: result.project.slug,
    agent_id: cmoAgentId,
    title,
    brief,
    success_criteria,
    assigner_agent_id: null,
    status: "proposed",
  });

  // Same async-provisioning policy as createProjectAction (D4 + D6).
  // No `names` override — fall through to each template's default_name.
  const provisionPromise = ensureProjectAgents(
    result.project.slug,
    DEFAULT_ONBOARDING_TEMPLATE_KEYS,
  );
  startProvisioning(result.project.slug, provisionPromise);
  // After provisioning resolves, log + kick off the onboarding task.
  // We chain off provisionPromise (not Promise.all) so a failed provision
  // doesn't try to kickoff against an agent that doesn't exist.
  provisionPromise
    .then(async (prov) => {
      logAgentAction({
        project_slug: result.project.slug,
        agent_id: "system",
        action_type: "project_created",
        summary: `Project '${result.project.display_name}' created. ${prov.created.length} agents provisioned${prov.failed.length > 0 ? `, ${prov.failed.length} failed` : ""}.`,
        payload: prov,
      });
      // Only kick off the onboarding task when the CMO agent actually exists.
      const cmoOk =
        prov.created.includes(cmoAgentId) || prov.existed.includes(cmoAgentId);
      if (!cmoOk) {
        console.error(
          `[onboarding] CMO agent ${cmoAgentId} not provisioned; skipping onboarding task kickoff`,
        );
        return;
      }
      try {
        const { startTaskIfProposed } = await import(
          "@/server/orchestration/run-task"
        );
        startTaskIfProposed(onboardingTask);
      } catch (err) {
        console.error("[onboarding] failed to create CMO onboarding task:", err);
      }
    })
    .catch((err) => {
      console.error("Agent provisioning failed; project created but no agents:", err);
    });

  await setActiveProject(result.project.slug);
  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      slug: result.project.slug,
      display_name: result.project.display_name,
    },
  };
}

export async function reprovisionAgentsAction(slug: string): Promise<{ ok: true; created: string[]; existed: string[] } | { ok: false; error: string }> {
  try {
    // Scope to the same set onboarding uses — clicking "Reprovision" should
    // restore the onboarded bundle (cmo + google-ads), not auto-create
    // opt-in templates like SEO that the user never asked for.
    const { DEFAULT_ONBOARDING_TEMPLATE_KEYS } = await import(
      "@/server/agent-templates"
    );
    const result = await ensureProjectAgents(slug, DEFAULT_ONBOARDING_TEMPLATE_KEYS);
    revalidatePath("/", "layout");
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function switchProjectAction(slug: string): Promise<ActionResult> {
  await setActiveProject(slug);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function archiveProjectAction(
  slug: string,
): Promise<ActionResult<{ halted_crons: number }>> {
  const updated = archiveProject(slug);
  if (!updated) return { ok: false, error: "Project not found." };

  // Cascade: halt all OpenClaw crons matching this project's prefix.
  // Failure to halt is non-fatal; user can clean up manually via the cron tab.
  let halted = 0;
  try {
    const view = await listCronsForProject(slug);
    for (const group of view.groups) {
      for (const cron of group.crons) {
        if (cron.disabled) continue;
        try {
          await disableCron(cron.id);
          halted += 1;
        } catch (err) {
          console.error(`Failed to disable cron ${cron.id} during archive:`, err);
        }
      }
    }
  } catch (err) {
    console.error("Could not list crons during project archive:", err);
  }

  logAgentAction({
    project_slug: slug,
    agent_id: "system",
    action_type: "project_archived",
    summary: `Project archived. ${halted} cron${halted === 1 ? "" : "s"} halted.`,
  });

  revalidatePath("/", "layout");
  return { ok: true, data: { halted_crons: halted } };
}

export async function renameProjectAction(slug: string, display_name: string): Promise<ActionResult> {
  const updated = renameProject(slug, display_name);
  if (!updated) return { ok: false, error: "Project not found or name invalid." };
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export type RenameProjectFullInput = {
  current_slug: string;
  new_display_name: string;
};

export type RenameProjectFullData = {
  slug: string;
  display_name: string;
  /** True when the slug actually changed (a full cascade ran). */
  full_rename: boolean;
  /** Per-agent outcomes for the rename pass. */
  agents_relocated: string[];
  agents_failed: Array<{ agent_id: string; error: string }>;
};

/**
 * Rename a project — display name and (when the slugified name differs) URL
 * slug too. Display-name-only changes hit just the DB. Slug changes cascade:
 * relocate every agent in the project to the new slug (re-uses
 * `relocateAgent`, which itself is the shared helper that powers per-agent
 * rename), then migrate every DB row keyed off project_slug.
 *
 * After a full rename: agent_ids change from `<old>-<slug>` to `<new>-<slug>`,
 * cron names rewrite via clone, workspace dirs move, session JSONL files
 * relocate, and the active-project cookie repoints at the new slug.
 */
export async function renameProjectFullAction(
  input: RenameProjectFullInput,
): Promise<ActionResult<RenameProjectFullData>> {
  const current = getProject(input.current_slug);
  if (!current) return { ok: false, error: `Project '${input.current_slug}' not found.` };

  const newName = input.new_display_name.trim();
  if (!newName) return { ok: false, error: "Name cannot be empty." };

  const newSlugResult = slugify(newName);
  if (!newSlugResult.ok) {
    return { ok: false, error: `Invalid name: ${newSlugResult.reason}` };
  }
  const newSlug = newSlugResult.slug;
  const sameSlug = newSlug === current.slug;

  // Display-name-only change — cheap path.
  if (sameSlug) {
    if (newName === current.display_name) {
      return {
        ok: true,
        data: {
          slug: current.slug,
          display_name: current.display_name,
          full_rename: false,
          agents_relocated: [],
          agents_failed: [],
        },
      };
    }
    renameProject(current.slug, newName);
    revalidatePath("/", "layout");
    return {
      ok: true,
      data: {
        slug: current.slug,
        display_name: newName,
        full_rename: false,
        agents_relocated: [],
        agents_failed: [],
      },
    };
  }

  if (getProject(newSlug)) {
    return { ok: false, error: `A project with slug '${newSlug}' already exists.` };
  }

  // 1) Relocate every agent into the new project slug (keeping each agent's
  //    own slug + display name + clone provenance intact).
  const agents = await listProjectAgents(current.slug);
  const agentsRelocated: string[] = [];
  const agentsFailed: Array<{ agent_id: string; error: string }> = [];
  for (const a of agents) {
    try {
      const meta = readAgentMeta(a.agent_id);
      await relocateAgent({
        old_agent_id: a.agent_id,
        source_project_slug: current.slug,
        new_project_slug: newSlug,
        new_slug: a.slug,
        new_display_name: a.name,
        preserve_template_key: a.template_key,
        preserve_source_agent_id: meta?.source_agent_id,
        preserve_created_at: meta?.created_at,
      });
      agentsRelocated.push(a.agent_id);
    } catch (err) {
      agentsFailed.push({
        agent_id: a.agent_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2) Migrate DB rows. If a child-table update fails the rename is partial;
  //    surface a clear error but leave the moved agents in place (they're
  //    addressable under the new slug already).
  try {
    changeProjectSlug(current.slug, newSlug, newName);
  } catch (err) {
    return {
      ok: false,
      error: `DB migration failed after agent move: ${
        err instanceof Error ? err.message : String(err)
      }. Agents already moved; cleanup needed.`,
    };
  }

  // 2.5) Move the canonical PROJECT.md directory from old slug → new slug
  //      so the brief survives the rename. The per-agent sidecar copies
  //      get rewritten on the next ensureProjectAgents pass (or
  //      writeIdentityFile call); the canonical file is the source of
  //      truth they read from, so moving this is what matters.
  try {
    const { renameProjectBriefDir } = await import(
      "@/server/onboarding/project-brief"
    );
    await renameProjectBriefDir(current.slug, newSlug);
  } catch (err) {
    console.warn(
      `[rename-project] failed to move PROJECT.md dir from ${current.slug} to ${newSlug}:`,
      err,
    );
  }

  // 3) Repoint the active-project cookie if it was this one.
  const c = await cookies();
  if (c.get("notfair_active_project")?.value === current.slug) {
    await setActiveProject(newSlug);
  }

  revalidatePath("/", "layout");

  return {
    ok: true,
    data: {
      slug: newSlug,
      display_name: newName,
      full_rename: true,
      agents_relocated: agentsRelocated,
      agents_failed: agentsFailed,
    },
  };
}

export async function getProjectDeletionSummaryAction(
  slug: string,
): Promise<ActionResult<ProjectDeletionSummary>> {
  const project = getProject(slug);
  if (!project) return { ok: false, error: `Project '${slug}' not found.` };
  try {
    const summary = await getProjectDeletionSummary(slug);
    return { ok: true, data: summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type DeleteProjectData = {
  agents: string[];
  agentsFailed: Array<{ agentId: string; error: string }>;
  crons: number;
  cronsFailed: number;
  mcps: number;
  mcpsFailed: number;
};

export async function deleteProjectAction(
  slug: string,
  confirmedSlug: string,
): Promise<ActionResult<DeleteProjectData>> {
  if (slug !== confirmedSlug) {
    return { ok: false, error: "Confirmation slug does not match." };
  }
  const project = getProject(slug);
  if (!project) return { ok: false, error: `Project '${slug}' not found.` };

  const projectAgentEntries = await listProjectAgents(slug);
  const deletedAgents: string[] = projectAgentEntries.map((a) => a.agent_id);
  const agentsFailed: Array<{ agentId: string; error: string }> = [];

  // Count crons + MCP tokens upfront so the result shape stays informative.
  let cronsDeleted = 0;
  try {
    const view = await listCronsForProject(slug);
    cronsDeleted = view.groups.reduce((acc, g) => acc + g.crons.length, 0);
  } catch {
    // best-effort
  }
  const { listProjectMcpTokens } = await import("@/server/mcp/tokens");
  const mcpsRevoked = listProjectMcpTokens(slug).length;
  const mcpsFailed = 0;
  const cronsFailed = 0;

  // Single shot — drops every artifact tied to this project: agent workspace
  // dirs, scheduled_jobs + runs, sessions + transcripts, mcp_tokens. Adapter
  // MCP entries get unregistered too.
  try {
    await cascadeDeleteProjectArtifacts(slug);
  } catch (err) {
    console.error("[delete-project] cascade failed:", err);
    agentsFailed.push({
      agentId: "(project)",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Drop the in-memory provisioning Promise so a re-created project with the
  // same slug starts fresh.
  clearProvisioning(slug);

  // 5) Canonical PROJECT.md directory at ~/.notfair-cmo/projects/<slug>/.
  //    The per-agent sidecar copies inside each workspace were already wiped
  //    by cascadeDeleteAgent's `rm -rf` on the workspace dir; this is the
  //    last surface that holds the project brief on disk. Without this,
  //    recreating a project with the same slug later would silently inherit
  //    the prior tenant's PROJECT.md (writeIdentityFile inlines it if it
  //    exists). Best-effort — a missing dir is a no-op.
  try {
    const { deleteProjectBriefDir } = await import(
      "@/server/onboarding/project-brief"
    );
    await deleteProjectBriefDir(slug);
  } catch (err) {
    console.warn(
      `[delete-project] failed to remove PROJECT.md dir for ${slug}:`,
      err,
    );
  }

  // 6) Local DB rows.
  deleteProjectRow(slug);

  // 7) Clear active-project cookie if it pointed at this one.
  const c = await cookies();
  if (c.get("notfair_active_project")?.value === slug) {
    await clearActiveProject();
  }

  // No logAgentAction here — agent_actions has a FK to projects.slug, and
  // deleteProjectRow already purges rows for this slug, so any log entry
  // would either FK-fail or be wiped on the spot.

  revalidatePath("/", "layout");

  return {
    ok: true,
    data: {
      agents: deletedAgents,
      agentsFailed,
      crons: cronsDeleted,
      cronsFailed,
      mcps: mcpsRevoked,
      mcpsFailed,
    },
  };
}
