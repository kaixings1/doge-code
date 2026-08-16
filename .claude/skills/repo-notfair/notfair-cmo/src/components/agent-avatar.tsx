import type { AgentTemplateKey } from "@/server/agent-templates";

/**
 * Cute pixel-art avatars for each specialist role. Hand-designed on a
 * 16×16 grid so the faces stay crisp at any render size (the SVG uses
 * shape-rendering="crispEdges"). Each character has:
 *
 *   - a role-tinted soft background circle, matching the colored chip
 *     used elsewhere in the system (CMO blue, Google Ads amber, Meta
 *     pink, SEO emerald)
 *   - a per-character palette (hair colour, accent) so the four faces
 *     are visually distinct at small sizes
 *   - one signature accessory (glasses, headset, hair clip, magnifying
 *     glass) so the role reads in one glance
 *
 * The grids are intentionally schematic — at 38px (the glyph slot) the
 * eye is roughly 2×2 pixels, so we lean on the silhouette + hair +
 * accessory rather than fine facial detail.
 */

type Avatar = {
  grid: readonly string[];
  palette: Record<string, string>;
  /** Background wash behind the face — subtle role colour. */
  bg: string;
};

const SKIN = "#F2C8A0";
const SKIN_SHADOW = "#E0AE85";
const EYE = "#1E1E22";
const MOUTH = "#C36A6A";
const CHEEK = "#F9B7A6";

/**
 * Greg — CMO. Neat side part, glasses, navy collar peeking. The
 * executive of the four. Blue background to match the sidebar CMO chip.
 */
const CMO: Avatar = {
  bg: "#DBE7FB",
  palette: {
    h: "#5B3A1F", // hair (warm brown)
    H: "#3F2916", // hair shadow
    s: SKIN,
    S: SKIN_SHADOW,
    e: EYE,
    g: "#6B7280", // glasses frame
    m: MOUTH,
    c: CHEEK,
    t: "#1F3A8A", // tie/jacket navy
    w: "#FFFFFF", // shirt collar
  },
  grid: [
    "................",
    "................",
    ".....HHHHHH.....",
    "....HhhhhhhH....",
    "...HhhhhhhhhH...",
    "...Hhssssshhh...",
    "...hsSssssShh...",
    "...gsegssges....", // glasses
    "...hsesssesh....",
    "....hssssssh....",
    "....cssmsscs....",
    ".....ssssss.....",
    "....wsssssw.....",
    "...twwwwwwwt....", // collar + tie
    "..tttttttttt....",
    "..tttttttttt....",
  ],
};

/**
 * Ana — Google Ads specialist. Auburn ponytail, headset (the call-rep
 * vibe of running campaigns), warm amber background. Energetic.
 */
const GOOGLE_ADS: Avatar = {
  bg: "#FCE7C7",
  palette: {
    h: "#B85820", // auburn hair
    H: "#8A3F12",
    s: SKIN,
    S: SKIN_SHADOW,
    e: EYE,
    m: MOUTH,
    c: CHEEK,
    y: "#F59E0B", // headset accent
    Y: "#92400E",
    p: "#FFD9C2", // earring highlight
  },
  grid: [
    "................",
    "................",
    "....HHHHHHH.....",
    "...HhhhhhhhH....",
    "..yHhhhhhhhHy...", // headset over hair
    "..ysshhhhhssy...",
    "..ysSsssssSsy...",
    "..yseSsssSesy...",
    "..ssssesessss...",
    "...ssssssssp....", // earring dot
    "...cssmmsscs....",
    "....ssssssss....",
    "....ssssssss....",
    "...HhhhhhhhH....", // hair flows behind shoulders
    "..HhhhhhhhhhH...",
    "..hhhhhhhhhhhh..",
  ],
};

/**
 * Mia — Meta Ads specialist. Pink bob, side bangs, a sparkle decoration
 * (creative/social vibe). Pink background to match the chip.
 */
const META_ADS: Avatar = {
  bg: "#FCD5E2",
  palette: {
    h: "#E45A8A", // pink hair
    H: "#B83465",
    s: SKIN,
    S: SKIN_SHADOW,
    e: EYE,
    m: MOUTH,
    c: CHEEK,
    p: "#FCE7F0", // hair highlight
    "*": "#F472B6", // sparkle
  },
  grid: [
    "................",
    "................",
    "...HHHHHHHHH....",
    "..HhhhhhhhhhH...",
    ".Hhhhhhhhhhhh*..", // sparkle
    ".HhpssssspphhH..",
    ".Hhsssssssshh...",
    ".Hheseeesssh....",
    ".Hssseessshh....",
    "..hssSsssShh....",
    "..cssmmmssc.....",
    "...ssssssss.....",
    "...ssssssss.....",
    "..HhsssssshH....",
    ".HhhhhhhhhhhH...",
    "..hhhhhhhhhh....",
  ],
};

/**
 * Sam — SEO specialist. Green hair, round glasses with a magnifying-
 * glass handle peeking off one side (the search motif). Emerald
 * background.
 */
const SEO: Avatar = {
  bg: "#D4EEDD",
  palette: {
    h: "#3F8A4F", // green hair
    H: "#2A5E36",
    s: SKIN,
    S: SKIN_SHADOW,
    e: EYE,
    m: MOUTH,
    c: CHEEK,
    g: "#374151", // glasses + handle
    G: "#9CA3AF", // glasses inside highlight
  },
  grid: [
    "................",
    "................",
    "....HHHHHHH.....",
    "...HhhhhhhhH....",
    "..HhhhhhhhhhH...",
    "..Hhssssssshh...",
    "..hssSsssssSh...",
    "..gggssssgggh...", // glasses arms
    "..gGgeggeGgg....", // glasses lenses + eyes
    "...gggssgggg....",
    "...hsmmmsshg....", // handle of magnifier
    "....ssssssg.....",
    "....csscssg.....",
    "...hssssshg.....",
    "..hhhhhhhhh.....",
    "..hhhhhhhhh.....",
  ],
};

const AVATARS: Record<AgentTemplateKey, Avatar> = {
  cmo: CMO,
  google_ads: GOOGLE_ADS,
  meta_ads: META_ADS,
  seo: SEO,
};

/**
 * Render the pixel-art avatar for a template-backed agent. Pass the
 * pixel size (defaults to 38, matching `.ns-glyph`). The component
 * collapses to a `null` if no avatar exists for the role — callers
 * should fall back to a generic icon in that case.
 */
export function AgentAvatar({
  role,
  size = 38,
  className,
}: {
  role: AgentTemplateKey | null | undefined;
  size?: number;
  className?: string;
}) {
  const avatar = role ? AVATARS[role] : undefined;
  if (!avatar) return null;
  const grid = avatar.grid;
  const cols = grid[0]!.length;
  const rows = grid.length;
  const cellPx = size / Math.max(cols, rows);

  // One <rect> per non-transparent pixel. We also draw a background
  // circle (a 16-wide rounded rect that fills the viewBox) so the
  // avatar reads as a single chip the way our other ns-glyph slots do.
  const rects: React.ReactNode[] = [];
  rects.push(
    <rect
      key="bg"
      x={0}
      y={0}
      width={cols}
      height={rows}
      rx={cols * 0.22}
      ry={rows * 0.22}
      fill={avatar.bg}
    />,
  );
  for (let y = 0; y < rows; y++) {
    const row = grid[y]!;
    for (let x = 0; x < cols; x++) {
      const ch = row[x]!;
      const color = avatar.palette[ch];
      if (!color) continue;
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={1.01} // tiny overlap kills sub-pixel seams when zoomed
          height={1.01}
          fill={color}
        />,
      );
    }
  }

  return (
    <svg
      role="img"
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      style={{ width: size, height: size, display: "block" }}
      className={className}
    >
      {rects}
    </svg>
  );
}
