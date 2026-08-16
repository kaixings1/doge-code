const RESERVED_SLUGS = new Set([
  "api",
  "app",
  "auth",
  "admin",
  "system",
  "settings",
  "cron",
  "agent",
  "agents",
  "cmo",
  "notfair",
  "openclaw",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugResult =
  | { ok: true; slug: string }
  | { ok: false; reason: string };

export function slugify(input: string, maxLen = 40): SlugResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "input is empty" };

  const ascii = trimmed
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!ascii) return { ok: false, reason: "no valid characters" };

  const capped = ascii.slice(0, maxLen).replace(/-+$/g, "");

  if (!SLUG_PATTERN.test(capped)) {
    return { ok: false, reason: "result does not match slug pattern" };
  }

  if (RESERVED_SLUGS.has(capped)) {
    // Explicitly say "system word" — the previous wording ("'notfair'
    // is reserved") read like a row collision and led users to
    // delete-and-retry expecting the conflict to clear, when really
    // the slug is on a static block-list. Suggest a workaround so the
    // user isn't stuck guessing.
    return {
      ok: false,
      reason: `"${capped}" is a reserved system name — try a variation like "${capped}-team" or "${capped}-1".`,
    };
  }

  return { ok: true, slug: capped };
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}
