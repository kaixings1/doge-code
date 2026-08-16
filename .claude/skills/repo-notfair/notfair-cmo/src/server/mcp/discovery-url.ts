/**
 * Normalize an MCP resource URL into a stable comparable form: lowercase
 * scheme + host, preserve case-sensitive path, drop trailing slashes,
 * and remove any default port. Used to detect "this server is already
 * in the project" regardless of how the user typed the URL or how it
 * was slugified into a key historically.
 *
 * Returns the input unchanged when it can't be parsed — better to miss
 * a match than crash a render.
 */
export function normalizeResourceUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
  const scheme = u.protocol.toLowerCase();
  const host = u.hostname.toLowerCase();
  const port =
    (scheme === "https:" && u.port === "443") ||
    (scheme === "http:" && u.port === "80") ||
    !u.port
      ? ""
      : `:${u.port}`;
  const path = u.pathname.replace(/\/+$/, "");
  return `${scheme}//${host}${port}${path}`;
}

/**
 * Derive the RFC 9728 protected-resource discovery URL from a resource URL.
 *
 * Spec rule: the well-known suffix `.well-known/oauth-protected-resource`
 * is inserted between the origin and the resource path. For root-only
 * resources (path `/` or empty) the suffix sits directly under the origin
 * with no trailing path.
 *
 * Returns `null` for malformed input or non-HTTP(S) schemes.
 */
export function deriveDiscoveryUrl(resource_url: string): string | null {
  let u: URL;
  try {
    u = new URL(resource_url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  return `${u.origin}/.well-known/oauth-protected-resource${path}`;
}
