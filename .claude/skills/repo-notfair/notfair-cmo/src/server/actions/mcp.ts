"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getActiveProject } from "@/server/active-project";
import { isPresetKey, mcpSpecByKey } from "@/server/mcp-catalog";
import { setPending } from "@/server/mcp-pending";
import { disconnectMcp as runDisconnect } from "@/server/mcp/state";
import {
  insertUserMcpServer,
  findUserMcpServer,
  findUserMcpServerByResourceUrl,
  deleteUserMcpServer,
} from "@/server/db/user-mcp-servers";
import { slugify } from "@/lib/slug";
import { deriveDiscoveryUrl } from "@/server/mcp/discovery-url";

export type StartMcpConnectResult =
  | { ok: true; authorize_url: string }
  | { ok: false; error: string };

/**
 * Begin a one-click MCP OAuth flow. Server-side: discovery → DCR →
 * PKCE-pair → pending-state stash → caller redirects browser to the
 * authorize URL we return. The callback handler in
 * `/api/mcp-oauth/callback` finishes the exchange + writes the openclaw
 * mcp config.
 */
export async function startMcpConnect(input: {
  mcp_key: string;
  /**
   * Same-origin path to bounce back to after the callback. Anything that
   * doesn't look like a local path (no leading `/`, or `//` protocol-relative)
   * is dropped — the callback will use the default `/connections` instead.
   */
  return_to?: string;
}): Promise<StartMcpConnectResult> {
  const project = await getActiveProject();
  if (!project) {
    return { ok: false, error: "No active project. Pick one before connecting an MCP." };
  }

  const spec = mcpSpecByKey(project.slug, input.mcp_key);
  if (!spec) return { ok: false, error: `Unknown MCP key: ${input.mcp_key}` };

  let resolved: ResolvedAuthServer;
  try {
    resolved = await resolveAuthServer(spec.discovery_url);
  } catch (err) {
    return { ok: false, error: `Discovery failed: ${humanError(err)}` };
  }

  const origin = await originFromIncomingRequest();
  const redirect_uri = `${origin}/api/mcp-oauth/callback`;

  const auth_method = pickClientAuthMethod(
    resolved.token_endpoint_auth_methods_supported,
  );
  let dcr: DcrResponse;
  try {
    dcr = await dynamicRegister(
      resolved.registration_endpoint,
      redirect_uri,
      auth_method,
    );
  } catch (err) {
    return { ok: false, error: `Registration failed: ${humanError(err)}` };
  }

  // PKCE — S256 challenge from a 64-byte verifier.
  const code_verifier = base64url(randomBytes(64));
  const code_challenge = base64url(
    createHash("sha256").update(code_verifier).digest(),
  );
  const state = base64url(randomBytes(24));

  setPending(state, {
    catalog_key: spec.key,
    display_name: spec.display_name,
    resource_url: spec.resource_url,
    issuer: resolved.issuer,
    token_endpoint: resolved.token_endpoint,
    client_id: dcr.client_id,
    client_secret: dcr.client_secret,
    code_verifier,
    redirect_uri,
    project_slug: project.slug,
    return_to: sanitizeReturnTo(input.return_to),
    created_at: Date.now(),
  });

  const u = new URL(resolved.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", dcr.client_id);
  u.searchParams.set("redirect_uri", redirect_uri);
  u.searchParams.set("code_challenge", code_challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  u.searchParams.set("resource", spec.resource_url);

  return { ok: true, authorize_url: u.toString() };
}

export async function disconnectMcpAction(input: {
  mcp_key: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const project = await getActiveProject();
  if (!project) {
    return { ok: false, error: "No active project to disconnect from." };
  }
  try {
    await runDisconnect(project.slug, input.mcp_key);
  } catch (err) {
    return { ok: false, error: humanError(err) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Fetch the tool list for an external (OAuth-connected) MCP. Driven by the
 * tools modal on the Connections page — lazy on dialog-open so we don't
 * pay the RPC roundtrip when the user is just glancing at the page.
 *
 * Probes the MCP's tools/list endpoint with the stored bearer, then
 * normalizes each entry into the same ToolSummary shape we ship for
 * built-in tools — the modal renders both identically.
 */
export async function listMcpToolsAction(input: {
  mcp_key: string;
}): Promise<
  | { ok: true; tools: import("@/server/mcp-server/tool-summaries").ToolSummary[] }
  | { ok: false; error: string }
> {
  const project = await getActiveProject();
  if (!project) {
    return { ok: false, error: "No active project." };
  }
  const { getMcpConfig, mcpRpcAutoRefresh } = await import("@/server/mcp/rpc");
  const cfg = getMcpConfig(project.slug, input.mcp_key);
  if (!cfg) {
    return { ok: false, error: "MCP is not configured for this project." };
  }
  const r = await mcpRpcAutoRefresh<{
    tools?: Array<{ name?: unknown; description?: unknown; inputSchema?: unknown }>;
  }>(project.slug, input.mcp_key, "tools/list", {}, { timeoutMs: 5_000 });
  if (!r.ok) {
    const message =
      r.kind === "http_error"
        ? `HTTP ${r.status}`
        : r.kind === "rpc_error"
          ? `RPC ${r.code}: ${r.message}`
          : r.kind === "timeout"
            ? "MCP call timed out"
            : r.kind === "aborted"
              ? "MCP call aborted"
              : r.kind === "malformed_response"
                ? r.message
                : r.message;
    return { ok: false, error: message };
  }
  const { argsFromJsonSchema } = await import("@/server/mcp-server/tool-summaries");
  const tools = Array.isArray(r.result?.tools)
    ? r.result.tools
        .filter(
          (
            t,
          ): t is { name: string; description?: string; inputSchema?: Record<string, unknown> } =>
            typeof t?.name === "string",
        )
        .map((t) => ({
          name: t.name,
          description: typeof t.description === "string" ? t.description : "",
          args:
            t.inputSchema && typeof t.inputSchema === "object"
              ? argsFromJsonSchema(t.inputSchema)
              : [],
        }))
    : [];
  return { ok: true, tools };
}

export type ProbeMcpDiscoveryResult =
  | {
      ok: true;
      discovery_url: string;
      issuer: string;
      registration_endpoint: string;
    }
  | { ok: false; error: string; kind: ProbeFailureKind };

type ProbeFailureKind =
  | "bad_url"
  | "no_discovery_doc"
  | "no_authorization_servers"
  | "as_metadata_missing_endpoints"
  | "dcr_unsupported";

/**
 * Validate that a candidate MCP resource URL is OAuth-2.0 connectable.
 *
 * Derives the RFC 9728 discovery URL from the resource URL, fetches it,
 * follows the first `authorization_servers` issuer, fetches its RFC 8414
 * metadata, and asserts the AS publishes a `registration_endpoint` (DCR).
 *
 * Returns the resolved discovery URL on success so the caller can stash
 * it on the user_mcp_servers row — the connect flow reuses that URL
 * verbatim, so we don't re-derive it later.
 */
export async function probeMcpDiscovery(input: {
  resource_url: string;
}): Promise<ProbeMcpDiscoveryResult> {
  const discovery_url = deriveDiscoveryUrl(input.resource_url);
  if (!discovery_url) {
    return {
      ok: false,
      kind: "bad_url",
      error: "Resource URL must be an https URL.",
    };
  }
  try {
    const resolved = await resolveAuthServer(discovery_url);
    return {
      ok: true,
      discovery_url,
      issuer: resolved.issuer,
      registration_endpoint: resolved.registration_endpoint,
    };
  } catch (err) {
    return classifyProbeError(err);
  }
}

export type AddUserMcpServerResult =
  | { ok: true; key: string }
  | { ok: false; error: string; kind: AddFailureKind };

type AddFailureKind = ProbeFailureKind | "no_project" | "name_unusable";

const KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Register an MCP server for the active project — idempotent.
 *
 *  - If `key` matches a preset (e.g. `notfair-googleads`), the action
 *    only ensures the key is *unhidden* (clears the per-project
 *    hide-list). No row is written; the preset entry surfaces again via
 *    `getMcpCatalog`.
 *  - If a `user_mcp_servers` row for the key already exists, the action
 *    is a no-op success — used by Browse-connectors so re-clicking a
 *    tile after a canceled OAuth simply re-runs `startMcpConnect`
 *    instead of erroring on "already exists".
 *  - Otherwise probes RFC 9728 discovery + DCR; on success, inserts a
 *    new `user_mcp_servers` row.
 *
 * `key` accepts a stable preset/connector identifier to bypass
 * slugification (e.g. Browse passes `notfair-googleads` directly so it
 * matches the preset key rather than `slugify("NotFair Google Ads")` =
 * `notfair-google-ads`). When omitted, the display name is slugified.
 */
export async function addUserMcpServerAction(input: {
  display_name: string;
  description?: string;
  resource_url: string;
  /** Optional canonical key override (used by Browse connectors). */
  key?: string;
}): Promise<AddUserMcpServerResult> {
  const project = await getActiveProject();
  if (!project) {
    return {
      ok: false,
      kind: "no_project",
      error: "No active project. Pick one before adding an MCP server.",
    };
  }

  let key: string;
  if (input.key && KEY_PATTERN.test(input.key)) {
    key = input.key;
  } else {
    const slug = slugify(input.display_name);
    if (!slug.ok) {
      return {
        ok: false,
        kind: "name_unusable",
        error: `Can't derive a key from this name: ${slug.reason}.`,
      };
    }
    key = slug.slug;
  }

  // Preset re-add: just un-hide. No row to write, no discovery probe.
  if (isPresetKey(key)) {
    const { removeHiddenMcpPresetKey } = await import("@/server/db/projects");
    removeHiddenMcpPresetKey(project.slug, key);
    revalidatePath("/", "layout");
    return { ok: true, key };
  }

  // User row already exists for this key — Browse "click again" path.
  if (findUserMcpServer(project.slug, key)) {
    return { ok: true, key };
  }

  // Same MCP server (same URL) is already in this project under a
  // different key — e.g. NotFair Meta Ads was added pre-canonical-id and
  // saved as `notfair-meta-ads`, while the tile click would use
  // `notfair-metaads`. Treat as an idempotent re-pick: return the
  // existing key so the connect chain reuses it instead of writing a
  // duplicate row.
  const existingByUrl = findUserMcpServerByResourceUrl(
    project.slug,
    input.resource_url,
  );
  if (existingByUrl) {
    return { ok: true, key: existingByUrl.key };
  }

  const probe = await probeMcpDiscovery({ resource_url: input.resource_url });
  if (!probe.ok) return probe;
  insertUserMcpServer({
    project_slug: project.slug,
    key,
    display_name: input.display_name.trim(),
    description: input.description?.trim() ?? "",
    resource_url: input.resource_url.trim(),
    discovery_url: probe.discovery_url,
  });
  revalidatePath("/", "layout");
  return { ok: true, key };
}

/**
 * Remove an MCP server from the active project. Works on both presets
 * and user rows:
 *
 *  - Preset: appends the key to `projects.hidden_mcp_preset_keys_json`
 *    so `getMcpCatalog` filters it out from now on. Token + adapter
 *    cleanup runs the same way.
 *  - User row: deletes the `user_mcp_servers` row.
 *
 * Either path also drops the stored bearer and unregisters from every
 * agent's harness config.
 */
export async function removeUserMcpServerAction(input: {
  mcp_key: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const project = await getActiveProject();
  if (!project) {
    return { ok: false, error: "No active project." };
  }
  const isPreset = isPresetKey(input.mcp_key);
  if (!isPreset) {
    const row = findUserMcpServer(project.slug, input.mcp_key);
    if (!row) {
      return { ok: false, error: `Unknown MCP key: ${input.mcp_key}.` };
    }
  }
  try {
    await runDisconnect(project.slug, input.mcp_key);
    const { listProjectAgents } = await import("@/server/agent-meta");
    const { getProject, addHiddenMcpPresetKey } = await import(
      "@/server/db/projects"
    );
    const { requireAdapter } = await import("@/server/adapters/registry");
    const proj = getProject(project.slug);
    if (proj) {
      const adapter = requireAdapter(proj.harness_adapter);
      const agents = await listProjectAgents(project.slug);
      for (const agent of agents) {
        try {
          await adapter.unregisterMcp({
            serverName: input.mcp_key,
            projectSlug: project.slug,
            agentId: agent.agent_id,
          });
        } catch {
          // best-effort
        }
      }
    }
    if (isPreset) {
      addHiddenMcpPresetKey(project.slug, input.mcp_key);
    } else {
      deleteUserMcpServer(project.slug, input.mcp_key);
    }
  } catch (err) {
    return { ok: false, error: humanError(err) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ─── helpers ────────────────────────────────────────────────────────

type ResolvedAuthServer = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  /**
   * The AS's advertised auth methods for the token endpoint. Drives DCR
   * registration: we prefer the public-PKCE `none` method when the AS
   * supports it (MCP spec default), and fall back to `client_secret_post`
   * for servers like Supabase that don't accept public clients.
   */
  token_endpoint_auth_methods_supported: string[];
};

type ClientAuthMethod = "none" | "client_secret_post";

class ProbeError extends Error {
  kind: ProbeFailureKind;
  constructor(kind: ProbeFailureKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

async function resolveAuthServer(
  resourceDiscoveryUrl: string,
): Promise<ResolvedAuthServer> {
  // RFC 9728: GET .well-known/oauth-protected-resource → carries the
  // `authorization_servers` array. We pick the first and then fetch its
  // RFC 8414 AS metadata to learn registration/token/authorize endpoints.
  let r1: unknown;
  try {
    r1 = await fetchJson(resourceDiscoveryUrl, 8000);
  } catch (err) {
    throw new ProbeError(
      "no_discovery_doc",
      err instanceof Error ? err.message : String(err),
    );
  }
  const servers = (r1 as { authorization_servers?: unknown }).authorization_servers;
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new ProbeError(
      "no_authorization_servers",
      "no authorization_servers in discovery doc",
    );
  }
  const issuer = String(servers[0]).replace(/\/$/, "");
  // RFC 8414 §3.1 says the well-known suffix is inserted between the
  // issuer's host and path (the "inserted" form). The OIDC Discovery and
  // some MCP servers also accept the issuer-suffix variant ("appended"
  // form). Try each in order until one returns valid metadata.
  const candidates = asMetadataCandidates(issuer);
  const attempts: string[] = [];
  let meta: Partial<ResolvedAuthServer> | null = null;
  for (const url of candidates) {
    attempts.push(url);
    try {
      meta = (await fetchJson(url, 8000)) as Partial<ResolvedAuthServer>;
      break;
    } catch {
      // try the next candidate
    }
  }
  if (!meta) {
    throw new ProbeError(
      "as_metadata_missing_endpoints",
      `Couldn't fetch AS metadata. Tried: ${attempts.join(", ")}`,
    );
  }
  if (!meta.authorization_endpoint || !meta.token_endpoint) {
    throw new ProbeError(
      "as_metadata_missing_endpoints",
      "AS metadata missing authorize/token endpoints",
    );
  }
  if (!meta.registration_endpoint) {
    throw new ProbeError(
      "dcr_unsupported",
      "AS metadata is missing registration_endpoint — dynamic client registration is required.",
    );
  }
  const advertised = (meta as Record<string, unknown>)
    .token_endpoint_auth_methods_supported;
  return {
    issuer,
    authorization_endpoint: meta.authorization_endpoint,
    token_endpoint: meta.token_endpoint,
    registration_endpoint: meta.registration_endpoint,
    token_endpoint_auth_methods_supported: Array.isArray(advertised)
      ? advertised.filter((s): s is string => typeof s === "string")
      : [],
  };
}

/**
 * Pick a token-endpoint auth method that the AS supports AND we know
 * how to drive at the callback. We prefer `none` (PKCE-only, MCP-spec
 * default); when the AS doesn't advertise it (Supabase, some OIDC
 * providers) we fall back to `client_secret_post`. `client_secret_basic`-
 * only servers aren't supported — the callback's token exchange sends
 * the secret in the POST body, not the Authorization header.
 */
function pickClientAuthMethod(supported: string[]): ClientAuthMethod {
  if (supported.length === 0) return "none";
  if (supported.includes("none")) return "none";
  return "client_secret_post";
}

/**
 * Build the AS-metadata URLs to probe, in priority order, for a given
 * issuer. The "inserted" variants are spec-correct (RFC 8414 §3.1 / OIDC
 * Discovery §4); the "appended" variants are a common deviation a number
 * of real-world MCP servers still ship — including, ironically, the
 * issuer URL Stripe advertises (`https://access.stripe.com/mcp`), which
 * resolves only via the inserted form.
 */
function asMetadataCandidates(issuer: string): string[] {
  const out: string[] = [];
  let u: URL;
  try {
    u = new URL(issuer);
  } catch {
    return out;
  }
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  const origin = u.origin;
  // RFC 8414: inserted between host and path.
  out.push(`${origin}/.well-known/oauth-authorization-server${path}`);
  // OIDC Discovery: same insertion shape with a different suffix.
  out.push(`${origin}/.well-known/openid-configuration${path}`);
  // Appended-form fallbacks for servers that don't follow the insertion
  // rule. Only worth trying when the issuer has a non-root path; for a
  // root issuer the appended form equals the inserted form.
  if (path) {
    out.push(`${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`);
    out.push(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`);
  }
  return out;
}

function classifyProbeError(err: unknown): ProbeMcpDiscoveryResult {
  if (err instanceof ProbeError) {
    return { ok: false, kind: err.kind, error: err.message };
  }
  return {
    ok: false,
    kind: "no_discovery_doc",
    error: err instanceof Error ? err.message : String(err),
  };
}

type DcrResponse = {
  client_id: string;
  client_secret?: string;
  token_endpoint_auth_method?: string;
};

async function dynamicRegister(
  registration_endpoint: string,
  redirect_uri: string,
  auth_method: ClientAuthMethod,
): Promise<DcrResponse> {
  // PKCE-only `none` is the MCP-spec default for public clients. Some
  // OAuth servers (Supabase, certain OIDC providers) reject `none` and
  // require a confidential client; for those we register as
  // `client_secret_post` — the AS returns a client_secret which the
  // callback then sends alongside the code at token exchange.
  //
  // grant_types includes `refresh_token` per SEP-2207 ("OIDC-Flavored
  // Refresh Token Guidance", accepted 2026-02-04). Some Authorization
  // Servers (notably Stripe's MCP) only issue refresh tokens to clients
  // that explicitly register the capability — without this we still get
  // a working access token but the user is forced to reconnect when it
  // expires (~1h for Stripe). Servers that don't support refresh_token
  // grant either ignore the extra entry or reject it; in the latter case
  // we'd fall back to the authorization_code-only registration anyway.
  const body = {
    client_name: "notfair-cmo",
    redirect_uris: [redirect_uri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: auth_method,
  };
  const res = await fetch(registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DCR ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as DcrResponse;
  if (!json.client_id) throw new Error("DCR response missing client_id");
  return json;
}

async function fetchJson(url: string, timeout_ms: number): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout_ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function originFromIncomingRequest(): Promise<string> {
  const h = await headers();
  // Next surfaces forwarded headers when behind a proxy; fall back to host.
  const proto = h.get("x-forwarded-proto") ?? "http";
  const rawHost = h.get("x-forwarded-host") ?? h.get("host");
  if (!rawHost) {
    throw new Error("Could not derive origin from request headers");
  }
  // RFC 8252 §7.3 says native OAuth clients use the loopback IP (127.0.0.1)
  // rather than the `localhost` hostname; some providers (Vercel) enforce
  // this and reject `http://localhost` as an "invalid redirect URL".
  // Normalize so the registered + exchanged redirect URI is loopback-IP
  // regardless of which form the user typed into the address bar.
  const host = rawHost.replace(/^localhost(:|$)/, "127.0.0.1$1");
  return `${proto}://${host}`;
}

function humanError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Accept only same-origin, path-only redirect targets. Anything with a scheme
 * or a `//` prefix would let a caller redirect the user off-site after OAuth,
 * which is an open-redirect class bug. Returns undefined when the input
 * isn't a safe local path, so the callback falls back to /connections.
 */
function sanitizeReturnTo(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith("/")) return undefined;
  if (raw.startsWith("//")) return undefined;
  return raw;
}
