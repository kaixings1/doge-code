import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  TEMPLATES,
  agentNameFor,
  agentUrlSlug,
  urlSlugForTemplate,
  type AgentTemplateKey,
} from "./agent-templates";

/**
 * Per-agent meta we own (notfair-cmo) and store next to the agent's workspace
 * directory. OpenClaw doesn't have a place for our UI-facing display name +
 * project linkage, so this sidecar fills the gap without requiring a DB
 * migration. Authored at agent creation/clone time, read by the sidebar.
 */

export type AgentMeta = {
  /** Full OpenClaw agentId, e.g. `acme-cmo` or `acme-supa-clone`. */
  agent_id: string;
  /** Project slug this agent belongs to. */
  project_slug: string;
  /**
   * Personal name the user assigned (e.g. "Greg", "Ana"). IMMUTABLE —
   * set once at agent-create time. The URL slug is computed from this
   * + template_key (see agentUrlSlug); the sidebar shows this as the
   * primary label next to a role pill.
   */
  name: string;
  /**
   * URL slug — stored ONLY for non-template (cloned/custom) agents,
   * where there's no role+name pair to compute from. Template agents
   * always compute their slug from template_key + name and never write
   * this field.
   */
  slug?: string;
  /** If from one of our bootstrap templates, which one. */
  template_key?: AgentTemplateKey;
  /** When cloned, the source agentId. */
  source_agent_id?: string;
  created_at: string;
};

function notfairDataDir(): string {
  return process.env.NOTFAIR_CMO_DATA_DIR ?? join(homedir(), ".notfair-cmo");
}

function metaPath(agentId: string): string {
  return join(notfairDataDir(), "agents", agentId, "notfair-meta.json");
}

export async function writeAgentMeta(meta: AgentMeta): Promise<void> {
  const path = metaPath(meta.agent_id);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(meta, null, 2), "utf8");
}

export function readAgentMeta(agentId: string): AgentMeta | null {
  const path = metaPath(agentId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as AgentMeta;
  } catch {
    return null;
  }
}

export type ProjectAgentEntry = {
  agent_id: string;
  /**
   * URL slug. For template agents: `<role>-<slugified-name>` computed
   * from template_key + name. For cloned/custom: the stored slug.
   */
  slug: string;
  /** Personal name (e.g. "Greg"). */
  name: string;
  /** Role identifier (template key). Undefined for cloned/custom agents. */
  template_key?: AgentTemplateKey;
  description?: string;
  source_agent_id?: string;
  is_template_default: boolean;
};

/**
 * List agents for a project. Source of truth:
 * - notfair-meta.json sidecars whose `project_slug` field equals the requested
 *   slug. The sidecar — not the workspace dir name — is authoritative, so
 *   projects whose slug is a string prefix of another project's slug (e.g.
 *   "acme" vs "acme-q4") never cross-leak their rosters.
 * - For each TEMPLATE not yet present on disk, fall back to a synthesized
 *   default entry so the user sees the bootstrap agents immediately even
 *   before `ensureProjectAgents` runs.
 */
export async function listProjectAgents(project_slug: string): Promise<ProjectAgentEntry[]> {
  // Two-phase merge:
  //   - Template agents are deduplicated by template_key. The agent_id
  //     encodes the personal name (e.g. demo-cmo-greg), so the seed and
  //     the overlay COULD disagree on the id if the on-disk sidecar still
  //     uses an older naming. Keying by template_key prevents that from
  //     showing two CMO entries in the sidebar.
  //   - Cloned/custom agents (no template_key) key by their agent_id since
  //     a project may have many of them.
  const byRole = new Map<string, ProjectAgentEntry>();
  const byAgentId = new Map<string, ProjectAgentEntry>();

  // 1) Seed with the templates an onboarded project actually has. Opt-in
  //    templates (e.g. SEO until v1.1 lights it up) live in TEMPLATES but
  //    are NOT pre-seeded — they only appear when a meta sidecar shows
  //    one was actually provisioned.
  for (const t of TEMPLATES) {
    if (!t.default_onboarding) continue;
    const agentId = agentNameFor(project_slug, t.key, t.default_name);
    byRole.set(t.key, {
      agent_id: agentId,
      slug: agentUrlSlug(t.key, t.default_name),
      name: t.default_name,
      description: t.description,
      template_key: t.key,
      is_template_default: true,
    });
  }

  // 2) Overlay anything we have meta for (template agents written by
  //    ensureProjectAgents, plus cloned/custom agents). Filter by the
  //    sidecar's `project_slug` field — NOT the dir name prefix — because
  //    a prefix like "acme-" also matches "acme-q4-cmo-greg" which belongs
  //    to a different project.
  const agentsRoot = join(notfairDataDir(), "agents");
  let entries: string[] = [];
  try {
    entries = await readdir(agentsRoot);
  } catch {
    // No agents dir yet — keep templates-only view.
    return Array.from(byRole.values());
  }
  // Coarse pre-filter: an agent that belongs to this project MUST have
  // an id starting with `<slug>-`. This cheaply skips clearly-unrelated
  // dirs without reading their sidecar. Project_slug match below is the
  // authoritative check.
  const prefix = `${project_slug}-`;
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const meta = readAgentMeta(entry);
    if (!meta) continue;
    // Hard isolation: only accept agents whose sidecar declares this
    // project as their owner. Catches the "acme" vs "acme-q4" collision.
    if (meta.project_slug !== project_slug) continue;
    const template = meta.template_key
      ? TEMPLATES.find((t) => t.key === meta.template_key)
      : undefined;
    if (template) {
      // Template agent: replace the seed row keyed by role.
      const slug = agentUrlSlug(template.key, meta.name);
      byRole.set(template.key, {
        agent_id: meta.agent_id,
        slug,
        name: meta.name,
        template_key: meta.template_key,
        source_agent_id: meta.source_agent_id,
        is_template_default: false,
      });
    } else {
      // Cloned/custom agent: key by agent_id.
      const slug = meta.slug ?? slugifyForCustom(meta.name);
      byAgentId.set(meta.agent_id, {
        agent_id: meta.agent_id,
        slug,
        name: meta.name,
        template_key: undefined,
        source_agent_id: meta.source_agent_id,
        is_template_default: false,
      });
    }
  }

  const result = new Map<string, ProjectAgentEntry>();
  for (const v of byRole.values()) result.set(v.agent_id, v);
  for (const v of byAgentId.values()) result.set(v.agent_id, v);

  // Stable order: templates first (in declared order), then custom by slug.
  const templateOrder = new Map(TEMPLATES.map((t, i) => [t.key, i]));
  return Array.from(result.values()).sort((a, b) => {
    const ai = a.template_key ? templateOrder.get(a.template_key) ?? 99 : 99;
    const bi = b.template_key ? templateOrder.get(b.template_key) ?? 99 : 99;
    if (ai !== bi) return ai - bi;
    return a.slug.localeCompare(b.slug);
  });
}

/** Workspace dir we hand to OpenClaw at creation time. */
export function workspaceDirFor(agentId: string): string {
  return join(notfairDataDir(), "agents", agentId);
}

/**
 * Fallback slug generator for cloned/custom agents (no template_key) whose
 * sidecar lacks an explicit `slug` field. Same shape as slugifyName but
 * lives here to avoid the agent-templates dependency for non-template
 * code paths.
 */
function slugifyForCustom(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export type ResolvedAgent = {
  agent_id: string;
  /** Personal name (e.g. "Greg"). */
  name: string;
  slug: string;
  template_key?: AgentTemplateKey;
};

/**
 * Resolve a URL slug to its full agent_id within the current project. Looks
 * up templates first, then any cloned/custom agents via the meta sidecar.
 * Returns null when no project agent matches the slug.
 */
export async function resolveAgentBySlug(
  project_slug: string,
  url_slug: string,
): Promise<ResolvedAgent | null> {
  const all = await listProjectAgents(project_slug);
  const hit = all.find((a) => a.slug === url_slug);
  if (!hit) return null;
  return {
    agent_id: hit.agent_id,
    name: hit.name,
    slug: hit.slug,
    template_key: hit.template_key,
  };
}
