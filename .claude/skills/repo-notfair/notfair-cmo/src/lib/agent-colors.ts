import type { AgentTemplateKey } from "@/server/agent-templates";

/**
 * Per-agent color palette used by the cron calendar so users can scan which
 * agent owns which job at a glance. Deliberately distinct hues that all read
 * well against the zinc neutral background.
 */
export type AgentColor = {
  /** Tailwind classes: chip background + text color. */
  chip: string;
  /** Solid dot/legend swatch. */
  dot: string;
  /** Label color when only the label is shown. */
  label: string;
};

const PALETTE: Record<AgentTemplateKey, AgentColor> = {
  cmo: {
    chip: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100 border-blue-200/60 dark:border-blue-900",
    dot: "bg-blue-500",
    label: "text-blue-700 dark:text-blue-300",
  },
  google_ads: {
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100 border-amber-200/60 dark:border-amber-900",
    dot: "bg-amber-500",
    label: "text-amber-700 dark:text-amber-300",
  },
  meta_ads: {
    chip: "bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-100 border-pink-200/60 dark:border-pink-900",
    dot: "bg-pink-500",
    label: "text-pink-700 dark:text-pink-300",
  },
  seo: {
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 border-emerald-200/60 dark:border-emerald-900",
    dot: "bg-emerald-500",
    label: "text-emerald-700 dark:text-emerald-300",
  },
};

/**
 * Extra palette used for custom or cloned agents (anything not in TEMPLATES).
 * Each entry is intentionally vivid — zinc/neutral would read as "disabled"
 * against the rest of the UI. Hue-hashing the slug below keeps the mapping
 * stable across renders without needing a DB.
 */
const EXTRA_PALETTE: AgentColor[] = [
  {
    chip: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100 border-violet-200/60 dark:border-violet-900",
    dot: "bg-violet-500",
    label: "text-violet-700 dark:text-violet-300",
  },
  {
    chip: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100 border-rose-200/60 dark:border-rose-900",
    dot: "bg-rose-500",
    label: "text-rose-700 dark:text-rose-300",
  },
  {
    chip: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-100 border-cyan-200/60 dark:border-cyan-900",
    dot: "bg-cyan-500",
    label: "text-cyan-700 dark:text-cyan-300",
  },
  {
    chip: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-100 border-fuchsia-200/60 dark:border-fuchsia-900",
    dot: "bg-fuchsia-500",
    label: "text-fuchsia-700 dark:text-fuchsia-300",
  },
  {
    chip: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100 border-teal-200/60 dark:border-teal-900",
    dot: "bg-teal-500",
    label: "text-teal-700 dark:text-teal-300",
  },
  {
    chip: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100 border-orange-200/60 dark:border-orange-900",
    dot: "bg-orange-500",
    label: "text-orange-700 dark:text-orange-300",
  },
  {
    chip: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100 border-indigo-200/60 dark:border-indigo-900",
    dot: "bg-indigo-500",
    label: "text-indigo-700 dark:text-indigo-300",
  },
  {
    chip: "bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-100 border-lime-200/60 dark:border-lime-900",
    dot: "bg-lime-500",
    label: "text-lime-700 dark:text-lime-300",
  },
];

/** Fast deterministic hash (djb2) so a slug always maps to the same color. */
function hashSlug(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) + h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Color for a template ROLE (cmo, google_ads, seo). Canonical lookup for
 * the sidebar role pill + cron calendar swatches — both should agree on
 * "CMO is blue" regardless of any personal-name suffix in the URL slug.
 * Stable across the lifetime of the project.
 */
export function colorForRole(role: AgentTemplateKey): AgentColor {
  return PALETTE[role];
}

/**
 * Resolve a color for an agent slug as it appears in our cron view.
 * Templates (cmo / google-ads / seo, with or without a `-<name>` suffix)
 * get their reserved hue. Anything else gets a stable color from the
 * extras palette via slug hash — never the zinc fallback, which reads
 * as "disabled".
 *
 * Accepts both legacy bare slugs (`cmo`) and the new role-plus-name
 * shape (`cmo-greg`) — the role prefix is matched against the palette
 * before falling through to the hash bucket.
 */
export function colorForAgentSlug(slug: string): AgentColor {
  // Try a direct lookup first (handles legacy "cmo" / "seo" slugs).
  const direct = PALETTE[slug.replace(/-/g, "_") as AgentTemplateKey];
  if (direct) return direct;
  // New shape: <role>-<name>. Walk the role keys longest-first so
  // "google_ads" matches before "cmo" wouldn't accidentally match
  // "cmo-anything".
  const roleKeys = Object.keys(PALETTE) as AgentTemplateKey[];
  const sorted = roleKeys.slice().sort((a, b) => b.length - a.length);
  for (const role of sorted) {
    const rolePrefix = role.replace(/_/g, "-");
    if (slug === rolePrefix || slug.startsWith(`${rolePrefix}-`)) {
      return PALETTE[role];
    }
  }
  return EXTRA_PALETTE[hashSlug(slug) % EXTRA_PALETTE.length]!;
}
