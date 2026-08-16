# notfair-cmo Design System

**Direction.** Apple-flavored product UI anchored on the Notfair brand green. Cool neutrals, generous whitespace, layered hairlines, restrained shadows. No warm cream, no editorial flourishes, no paper grain. The accent green from the Notfair logo (`#4CAF6E`) carries the brand; everything else stays out of its way.

If a design choice would feel at home in macOS System Settings, iOS Settings, or apple.com — it belongs. If it would feel at home in a magazine, a brutalist landing page, a hacker terminal, or a warm letterpress site — it doesn't.

---

## Brand

The mark lives at `notfair-cmo/public/notfair-mark-light.svg` (mirrored from the marketing site). It is the only acceptable brand artifact in product chrome — no monogram alternates, no "C" mark for "CMO," no lockup variations.

The green `#4CAF6E` lifted from the mark is `--accent`. Use it sparingly but distinctly: the brand mark itself, the primary CTA fill, the active progress step, "connected" status, sub-action text links, footnote anchors. **Never** use it for body text, generic info, or anything that competes with content.

---

## Color

### Surfaces

| Token | Hex | HSL | Use |
|---|---|---|---|
| `--bg` | `#F5F5F7` | `240 8% 96%` | Page background |
| `--surface` | `#FFFFFF` | `0 0% 100%` | Cards, list groups |
| `--surface-2` | `#EFEFF1` | `240 6% 94%` | Inset surfaces, hover states, app-icon glyph backgrounds |

### Ink

| Token | Hex | HSL | Use |
|---|---|---|---|
| `--ink` | `#1D1D1F` | `240 3% 12%` | Headings, primary text |
| `--ink-2` | `#2C2C2E` | `240 2% 18%` | Strong body emphasis (`<b>`, lead paragraph) |
| `--ink-3` | `#424245` | `240 2% 26%` | Body text |
| `--ink-4` | `#6E6E73` | `240 2% 44%` | Labels, status, secondary metadata |

Contrast targets: body text against `--bg` is ~11:1 (well past WCAG AAA). The intentional "soft" tier (`--ink-4`) lands at ~5.5:1 — still readable, but reserved for support text.

### Borders

| Token | Hex | HSL | Use |
|---|---|---|---|
| `--border` | `#D2D2D7` | `240 6% 83%` | Hairlines, card edges, dividers (`.5px` where retina-supported, `1px` fallback) |
| `--border-strong` | `#B8B8BE` | `240 5% 73%` | Focus rings, button outlines, separators that need to stand up |

### Accent (Notfair green)

| Token | Hex | HSL | Use |
|---|---|---|---|
| `--accent` | `#4CAF6E` | `138 39% 49%` | Brand mark, primary CTA, active state, "connected" indicator, links |
| `--accent-soft` | `#EDF7F0` | `138 31% 95%` | Glyph background on connected items, ghost-button hover fill |
| `--accent-border` | `#A5D7B6` | `137 35% 75%` | Accent rings, focus halos |

### What we don't have

No warm cream. No paper-grain texture. No gradient backgrounds. No drop-shadow brand colors. No purple/violet "tech" accent. No status-state palette yet — when we need success/warning/error colors, we'll add them as a separate scale; the brand green stays brand-only.

---

## Typography

**Stack.** System SF Pro via `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display'` with `'Inter'` as the cross-platform fallback. We do not load a web font for body text — SF Pro on Apple devices renders perfectly; Inter on the rest is close enough that the design holds.

**Scale.** All sizes have negative letter-spacing (Apple convention — display sans wants `-0.02em` to `-0.04em` depending on size).

| Token | Size | Weight | Letter-spacing | Use |
|---|---|---|---|---|
| Display | 56px | 600 | -0.04em | Page hero (`h1` on a wizard step) |
| Title | 32px | 600 | -0.03em | Section pages (Settings, Workspace home) |
| Subtitle | 21px | 400 | -0.015em | Lead paragraph under a Display |
| Section heading | 19px | 600 | -0.022em | "Recommended", "Other" group headers in a list |
| Body | 15px | 400 | -0.01em | Default text size, list-row titles |
| Body small | 13px | 400 | -0.005em | List-row descriptions, sub-actions, link labels |
| Caption | 12.5px | 500 | -0.005em | Footnotes, palette swatches, micro-meta |

**Rules.** Use weight to express hierarchy, never to fake contrast. If text looks weak, change the color (`--ink-3` → `--ink-2`), don't bump the weight. Italics are reserved for true citations; we do not use italic emphasis as a design element.

---

## Spacing

8px grid. Common gaps: `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`. The wizard container is `max-width: 780px` with `64px` top padding and `144px` bottom padding — Apple-grade breathing room.

Internal card padding is `18px × 22px` (vertical × horizontal). Gap between glyph and content in a list row is `16px`.

---

## Radii

| Token | Value | Use |
|---|---|---|
| Pill | `980px` | Buttons, status pills |
| Card | `18px` | List group containers |
| App-icon glyph | `9px` | The 38px square next to a list-row title (echoes iOS app icons) |
| Toggle / small chip | `6px` | Avoid larger UI — small chips are toggle-sized |

---

## Shadows

Three crisp levels. No inner highlights, no warm tints — Apple shadows are diffuse cool drops.

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,.04), 0 0 0 .5px rgba(0,0,0,.04);
--shadow:    0 1px 2px rgba(0,0,0,.05), 0 8px 24px -8px rgba(0,0,0,.10);
--shadow-lg: 0 2px 4px rgba(0,0,0,.06), 0 20px 50px -12px rgba(0,0,0,.18);
```

Use `--shadow` for primary cards (a list group, a primary surface). `--shadow-sm` for resting buttons, pills, palette swatches. `--shadow-lg` for floating panels (dropdown menus, dialogs).

---

## Components

### Frosted topbar

Sticky, translucent, backdrop-blurred. The Notfair SVG mark sits at `22px` tall with a `.5px` vertical separator at `--border-strong` between mark and the per-page label. Nav links are `13px` `--ink-3` with `--ink` hover.

```css
.topbar {
  background: rgba(245,245,247,.72);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: .5px solid rgba(0,0,0,.08);
  position: sticky; top: 0;
}
```

### Hero

`56px / 600 / -0.04em` headline. `21px / 400 / -0.015em` sub. `48px` between topbar and headline, `18px` between headline and sub. The hero is left-aligned on app screens, centered only on marketing surfaces (none in v1).

### Grouped list (iOS Settings pattern)

One shared rounded container, hairline (`.5px`) dividers between rows, no per-row shadow. Each row is `18px × 22px` padding, gets a `38px` app-icon glyph on the left, title + description in the middle, status on the right.

```html
<ol class="list">
  <li class="tile">
    <div class="glyph">G</div>
    <div class="body">
      <p class="name">Google Ads</p>
      <p class="desc">Campaigns, bids, keywords, search terms.</p>
    </div>
    <div class="status"><span class="pill">Connected</span></div>
  </li>
</ol>
```

### Buttons

Pill-shaped (`980px` radius), no shadow, solid fill. Two variants:

- **Primary.** Filled `--accent`, white text, `11px × 22px` padding, `15px / 500 / -0.012em`.
- **Ghost.** Transparent, `--accent` text, no border. Hover gives `--accent-soft` fill.

No outlined buttons, no shadowed buttons, no gradient buttons. If we need a destructive button, it gets a separate red token added; we do not improvise.

### Sub-action (text link with chevron)

`13px / 500` `--accent` text + `›` chevron (Unicode U+203A). No pill chrome, no border. iOS Settings-row "Tap to choose" convention.

### Connected indicator

A `7px` filled circle in `--accent` followed by the word "Connected" in `--accent` color. No pill background, no border. Inline next to the row's name or in the status column.

### Progress pips

`22px` circular dots in a horizontal row with `32px / .5px` hairline connectors. Done = filled `--ink`. Active = filled `--accent`. Pending = `--surface` with hairline border. The numeric label sits inside the dot at `11px / 500`.

---

## Motion

Defaults to `0.15s ease` for color/opacity/background. `0.18s cubic-bezier(.2,.7,.3,1)` for elevation / position transforms (lifts, translates). Avoid bounce, springs, and over-the-top entrance animations — Apple's product surfaces are nearly motionless; movement is reserved for navigation transitions.

---

## DO / DON'T

**DO**
- Trust whitespace. Apple ships pages with what feels like too much space — it isn't.
- Use color to express state (`--accent` = active/connected; `--ink-3` vs `--ink-4` = primary vs support).
- Make components "settings-row shaped" by default — grouped list, hairline divider, glyph + title + status.
- Use `.5px` hairlines on retina, `1px` fallback.

**DON'T**
- Don't add font weights to fake contrast. Change color instead.
- Don't bring back italics, eyebrows, mono micro-labels, all-caps section headers, dashed rules, or paper-grain textures.
- Don't introduce new accent colors. The brand green is the only chromatic moment. Greys do the rest.
- Don't use shadcn defaults verbatim — most arrive cooler-than-Apple by mistake (purple-tinted neutrals, gray borders too dark). Verify against `--ink` / `--border` tokens.
- Don't reach for emoji as glyphs — use a 1–2 letter app-icon letterform or an SVG icon.

---

## Open questions (parked, not blocking v1)

- **Dark mode.** Out of scope for v1. When we add it, we mirror Apple: a deep ink (`#0F0F11` or so), surfaces a single notch lighter, and the same `--accent` green — Apple keeps brand color identical across themes.
- **Status colors.** No success/warning/error tokens yet. Add when first needed; do not preempt.
- **Data display.** When dense tables or charts arrive, refine table-specific tokens (zebra rows, sticky headers). Don't extrapolate from settings-row conventions.

---

## Prototype reference

The Apple-flavored prototype that locked this system in lives at `/tmp/notfair-design-explore/06-notfair.html` for the duration of this design session. After application, treat this `DESIGN.md` as the source of truth — the prototype is disposable.
