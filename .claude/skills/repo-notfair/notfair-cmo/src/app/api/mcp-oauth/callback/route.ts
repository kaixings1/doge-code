import { NextResponse } from "next/server";
import { consumePending } from "@/server/mcp-pending";
import { setMcpBearer } from "@/server/mcp/state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * OAuth 2.0 redirect URI for the one-click MCP connect flow. The browser
 * lands here after the user authorizes upstream. We look up the pending
 * flow by `state`, exchange the code for an access token, write the
 * MCP config via `openclaw mcp set`, and bounce the user back to the
 * agent's MCP tab.
 *
 * On failure we still redirect (so the browser doesn't end up on a raw
 * JSON page); the destination carries `?mcp_error=…` for the page to
 * surface. The pending entry is always consumed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const upstreamError = url.searchParams.get("error");

  if (!state) {
    return htmlErrorPage("Missing state parameter; cannot resume the OAuth flow.");
  }

  const pending = consumePending(state);
  if (!pending) {
    return htmlErrorPage("This authorization link has expired or was already used.");
  }

  // The pending state may carry a `return_to` (e.g. the chat URL the user
  // started from). Default to / so the root redirect bounces them to their
  // active project's home if no caller asked for a specific destination.
  // `return_to` is already sanitized in startMcpConnect to be a same-origin
  // path; URL() with a base will additionally reject anything malformed.
  const back = new URL(pending.return_to ?? "/", request.url);

  if (upstreamError) {
    back.searchParams.set(
      "mcp_error",
      `Authorization rejected: ${upstreamError}`,
    );
    return NextResponse.redirect(back);
  }
  if (!code) {
    back.searchParams.set("mcp_error", "Authorization callback returned no code.");
    return NextResponse.redirect(back);
  }

  // Token exchange. Send PKCE + (defensively) the secret. Servers that
  // honor token_endpoint_auth_method=none ignore the secret; servers that
  // require it still accept this request. Either way PKCE is validated.
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: pending.client_id,
    redirect_uri: pending.redirect_uri,
    code_verifier: pending.code_verifier,
    resource: pending.resource_url,
  });
  if (pending.client_secret) body.set("client_secret", pending.client_secret);

  let tokenEnvelope: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  try {
    const res = await fetch(pending.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      back.searchParams.set(
        "mcp_error",
        `Token exchange failed (HTTP ${res.status}): ${truncate(text, 200)}`,
      );
      return NextResponse.redirect(back);
    }
    const parsed = JSON.parse(text) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!parsed.access_token) {
      back.searchParams.set("mcp_error", "Token endpoint returned no access_token.");
      return NextResponse.redirect(back);
    }
    tokenEnvelope = {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_in: parsed.expires_in,
      scope: parsed.scope,
    };
  } catch (err) {
    back.searchParams.set(
      "mcp_error",
      `Token exchange error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.redirect(back);
  }

  // Compute absolute expiry only when the provider advertised expires_in.
  // For providers that omit it (rare, but legal under RFC 6749), we leave
  // expires_at NULL and rely on reactive refresh-on-401.
  const expires_at =
    typeof tokenEnvelope.expires_in === "number"
      ? new Date(Date.now() + tokenEnvelope.expires_in * 1000).toISOString()
      : undefined;

  try {
    await setMcpBearer(
      pending.project_slug,
      pending.catalog_key,
      tokenEnvelope.access_token,
      {
        refresh_token: tokenEnvelope.refresh_token,
        expires_at,
        scope: tokenEnvelope.scope,
        // Stash everything the refresh helper needs so it can rotate the
        // access token later without bouncing through consent again.
        token_endpoint: pending.token_endpoint,
        client_id: pending.client_id,
        client_secret: pending.client_secret,
      },
    );
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // Scrub bearers + any oat_ token shape before exposing in the URL —
    // the redirect lands in browser history, server logs, and Referer
    // headers on the destination page. Leaking the access token there
    // would let any local-machine reader replay calls against the MCP.
    const scrubbed = raw
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
      .replace(/oat_[A-Za-z0-9_]+/gi, "oat_[redacted]");
    back.searchParams.set("mcp_error", `Saving MCP config failed: ${scrubbed}`);
    return NextResponse.redirect(back);
  }

  // Token is stored — now provision the specialist agent that matches
  // this MCP (when it's one of the recommended trio: notfair-googleads,
  // notfair-metaads, notfair-googlesearchconsole). The agent must exist
  // BEFORE we register the MCP for it: registerCatalogMcpForProject
  // iterates the project's agents and writes one MCP entry per agent,
  // so a fresh specialist needs to be on disk first or it gets skipped.
  // No-op for non-specialist MCPs (Stripe, Supabase, …).
  try {
    const { provisionSpecialistForMcp } = await import(
      "@/server/agent-templates"
    );
    await provisionSpecialistForMcp(pending.project_slug, pending.catalog_key);
  } catch (err) {
    console.error("[mcp-oauth] provisionSpecialistForMcp threw:", err);
  }

  // Wire the new token into every agent's harness config so running
  // agents actually see the MCP tool surface. Without this step the
  // Connections page reads "Connected" (because the probe finds the
  // token) but Greg / Ana can't call any of the catalog's tools because
  // the adapter config file was never updated.
  try {
    const { registerCatalogMcpForProject } = await import(
      "@/server/mcp-server/registration"
    );
    const results = await registerCatalogMcpForProject(
      pending.project_slug,
      pending.catalog_key,
    );
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.warn(
        `[mcp-oauth] ${failed.length}/${results.length} agents failed to register ${pending.catalog_key}:`,
        failed.map((f) => (f.ok ? null : f.error)).filter(Boolean),
      );
    }
  } catch (err) {
    console.error("[mcp-oauth] registerCatalogMcpForProject threw:", err);
  }

  // Flash banner uses the catalog name (what the user recognizes), not the
  // project-prefixed openclaw key.
  back.searchParams.set("mcp_connected", pending.display_name);
  return NextResponse.redirect(back);
}

function htmlErrorPage(message: string): Response {
  // Shown only when we can't even resolve the pending flow, so we have no
  // agent slug to redirect to. Bare minimal HTML — Tailwind isn't loaded.
  const body = `<!doctype html><html><body style="font-family:system-ui;padding:2rem;max-width:36rem;margin:auto">
<h1 style="margin:0 0 1rem;font-size:1.25rem">Couldn’t complete MCP connection</h1>
<p style="color:#666">${escapeHtml(message)}</p>
<p style="margin-top:2rem"><a href="/">← Back to app</a></p>
</body></html>`;
  return new Response(body, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
