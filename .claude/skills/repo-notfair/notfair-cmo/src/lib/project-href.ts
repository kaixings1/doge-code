/**
 * Build a project-scoped URL like `/<slug>/agents/cmo/chat`.
 *
 * The router treats every URL under `(app)/[project]/...` as project-scoped,
 * so every internal link inside the app shell needs the slug prefix. This
 * helper keeps that prefixing consistent and centralizes the leading-slash
 * normalisation so callers can pass either `agents/cmo` or `/agents/cmo`.
 *
 * Passing an empty `path` returns the project root: `/<slug>`.
 */
export function projectHref(slug: string, path = ""): string {
  if (!slug) {
    throw new Error("projectHref: slug is required");
  }
  if (!path || path === "/" || path === "") {
    return `/${slug}`;
  }
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `/${slug}/${trimmed}`;
}

/**
 * Strip the leading `/<currentSlug>` segment from a pathname and return the
 * rest (always with a leading slash, or empty when the pathname is the
 * project home). Used by the ProjectSwitcher so picking a different project
 * preserves the user's current view (`/foo/agents/cmo/tasks` → `/agents/cmo/tasks`).
 *
 * Returns `""` when the pathname doesn't actually start with `/<currentSlug>` —
 * the caller should treat that as "send the user to the new project's home."
 */
export function subPathFromPathname(
  pathname: string | null | undefined,
  currentSlug: string | null | undefined,
): string {
  if (!pathname || !currentSlug) return "";
  if (pathname === `/${currentSlug}`) return "";
  const prefix = `/${currentSlug}/`;
  if (pathname.startsWith(prefix)) {
    return `/${pathname.slice(prefix.length)}`;
  }
  return "";
}
