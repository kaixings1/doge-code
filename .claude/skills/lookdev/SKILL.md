---
name: lookdev
description: "人机协作的 Web 工作室，通过视觉调整 AI 生成输出。搭建本地交互式工作室（滑块、选择器、拖拽手柄）或用于散文和媒体的内联编辑/高亮/评注工作室，而不是猜测数值或提交静态比较网格。"
risk: safe
source: community
source_type: community
source_repo: connerkward/lookdev-studio-skill
date_added: "2026-06-16"
author: Conner K Ward
license: MIT
tags:
  - lookdev
  - design
  - ui
  - tuning
  - studio
  - visual-eval
  - annotation
tools:
  - claude-code
  - antigravity
  - cursor
  - gemini-cli
  - codex-cli
---
## When to Use

Use when the user says "lookdev", or asks to tune / dial in / iterate on the look of something, compare variations by feel, or review / edit / annotate a blog post, doc, copy, or media set. Use whenever "show me, I'll pick" beats asking the user to specify a number, and whenever you'd otherwise hand back a static grid or a wall of prose for review.

_Source: [connerkward/lookdev-studio-skill](https://github.com/connerkward/lookdev-studio-skill) (MIT)._

# Lookdev

When the user says **"lookdev"** — or any of: *tune*, *dial in*, *iterate on the look of*, *compare variations of*, *let me adjust*, *let me edit/annotate/mark up*, *review this post/doc/copy* — they mean **build an interactive in-browser tool the user directly manipulates**. Not a static grid of N variations. Not a Q&A where they specify numbers. Not a wall of prose they're asked to read and reply to in chat. A real-time studio where they act on the artifact and the change is captured.

**Two studio shapes — pick by what's being tuned:**

- **Visual-parameter lookdev** — the artifact's *look* is set by numbers/choices (color, type, layout, image treatment, animation, 3D). Controls = sliders, pickers, drag handles. This is the bulk of this skill (below).
- **Text & media lookdev** — the artifact is a *document, blog post, copy, or media set* and the user is editing/curating it: rewriting sentences, cutting boring paragraphs, highlighting, leaving margin comments, flagging "diagram goes here" / "wrong image, replace." Controls = **direct inline editing + selection highlight + anchored comments + media annotation**. See the dedicated section below. **A blog post / doc / script review IS this mode — never hand back a long markdown file and ask the user to react in chat. Stand up the annotation studio.**

## What it covers

Any visual decision the user picks by feel, not by spec. Expand this list as needed:

- **Image processing** — dither, halftone, posterize, ASCII, blur, edge, quantize, mosaic, color-grade
- **Color** — palette extraction (show coverage %), per-band pickers, saturation / contrast / gamma curves, harmony presets, theme tokens
- **Typography** — font selector, size / weight / leading / tracking / measure, live sample text, fallback stack
- **Layout, positioning, framing, spacing** — draggable & selectable elements; resize handles; margin / padding rulers; alignment guides; snap-to-grid; aspect-lock toggles
- **Crop & framing** — draggable crop rectangle with aspect lock; live cropped preview at production size
- **Animation / transitions** — easing curve editor, duration sliders, scrubber, replay
- **Component variants** — render hover / focus / disabled / loading / dark side by side on one page
- **Iconography** — stroke weight, corner radius, glyph on canvas
- **AI-generated content** — prompt input + param sliders + side-by-side regeneration grid
- **Anything else where "show me, I'll pick"** beats "ask me to specify a number"

## Controls must stay reachable while inspecting

If the studio shows a list, grid, or scroll-long set of variations, **controls must be visible from every scroll position**. The user has to be able to drag a slider while looking at row 14, not scroll back to the top each time.

Two approaches, pick by layout:

- **Sticky bar** (`position: sticky; top: 0`) at the top of the scroll container. Keep the bar visually distinct — paper background + blur backdrop + bottom border — so it doesn't muddy the specimens scrolling behind it. Sticky pins relative to the *nearest scrolling ancestor with a defined boundary*; if you nest it inside a sized parent (a `<header>` with `margin-bottom`, a `<div>` with a fixed height), it stops sticking at that parent's bottom edge. Lift it to be a direct child of `<body>` (or the page-wrap) so stickiness spans the whole page.
- **Floating overlay** (`position: fixed`) for hotkey-toggled controls — e.g. press `d` to reveal. The portfolio's `.debug-ctl` pattern is this: pinned top-left, transparent until summoned. Use when the controls shouldn't occupy permanent screen real estate (final viewers shouldn't see them; the author can summon on demand).

Anti-pattern: a top-of-page control panel that the user scrolls past and never sees again. They will tune blindly, give up, or guess. Either keep the controls in view *or* duplicate a compact control bar next to each variation row.

## Text & media lookdev — direct edit, highlight, comment, annotate

When the artifact is a **blog post, doc, copy deck, script, or media set**, the user is not turning knobs — they're *marking up the work the way an editor marks a manuscript*. The studio renders the **real artifact WYSIWYG** (the actual rendered blog with its real components/media, not a raw-markdown textarea) and lets the user act on it directly. Building this for a doc review is mandatory: **do not paste a long file into chat and ask "what do you think?" — that's the boring wall of text the user is rejecting.** Stand up the annotation studio and let them edit in place.

### The four affordances (build all that apply)

1. **Direct inline editing.** Every text block is editable in place — click a paragraph/heading and type. Use `contentEditable` per block (or click-to-swap-to-`<textarea>`), each block carrying a stable `data-block-id` that maps back to a source location (markdown/MDX line range, JSX node, or content key). Capture the *edited* text per block; the agent applies the diff to source. Don't make them retype in a separate field — they edit the rendered sentence.
2. **Selection highlight.** Select text → toolbar (or hotkey) applies a colored highlight (`<mark>`). Multiple colors = a legend the user defines (e.g. yellow "cut this", green "love it", red "wrong/fact-check"). Each highlight stores `{blockId, startOffset, endOffset, color, optional note}`.
3. **Anchored comments / margin notes.** Select text or click a media region → attach a comment shown in a **margin rail** (pin in the gutter, expand on hover/click) or as a numbered superscript. Comment = `{anchor, text}` where anchor is a block+range or a media region. This is how the user says "diagram goes here", "too long, cut to two sentences", "needs a real screenshot".
4. **Media annotation.** For images/figures: draw a box / drop a pin / arrow on the image and attach a note (`{mediaId, x, y, w, h, note}`); plus a per-media **flag menu** — "replace", "wrong model", "regenerate", "missing — generate one here". Placeholders ("DIAGRAM HERE", "MEDIA?") render as visible drop-zones the user clicks to specify what they want, directly addressing "where are the diagrams / where is the media."

### Round-trip is MANDATORY (same rule as the settings JSON)

The studio is worthless if the agent can't read the markup back out. Every edit, highlight, comment, and media-flag must export as **one machine-readable patch** with a single **Copy** button (and persist to `localStorage`/URL so a refresh doesn't lose work — this is human-labeled data; see `human-labeled-data-rule`). Shape:

```json
{
  "edits":      [{ "blockId": "p-12", "text": "new rewritten text" }],
  "highlights": [{ "blockId": "p-3", "range": [40, 88], "color": "cut", "note": "boring, drop" }],
  "comments":   [{ "anchor": "p-7", "text": "diagram goes here — flow of the save loop" }],
  "media":      [{ "mediaId": "fig-2", "flag": "replace", "note": "use a real screenshot, not ASCII" }]
}
```

The agent ingests this and bakes: applies the inline edits to the source file, acts on every comment/flag, swaps/generates the flagged media, resolves the highlights (cut the "cut" spans, etc.). Then re-serve the updated artifact for another pass. **No markup may exist that isn't in the export blob** — otherwise you're back to the user narrating changes by hand.

### Mechanics

- **Render the real thing.** MDX/React blog → mount the actual components; static page → render the real HTML/CSS. WYSIWYG per Architecture #5. An annotation layer over a fake-looking preview lies about the result.
- **Selection → offsets.** Use the `Selection`/`Range` API; store character offsets relative to the block's text content (not DOM node paths, which break on re-render). Re-apply highlights/comments on load by walking each block's text to the stored offsets.
- **Editing toolbar floats with the selection** (a small popover at the selection rect) or a sticky top bar — controls stay reachable (see section above). Hotkeys: highlight on a key (e.g. `h`), comment on `c`.
- **Keep edit/annotate modes distinct** so a stray click doesn't garble text while they meant to highlight — a mode toggle (Edit · Highlight · Comment) or modifier key.
- Everything else — serve locally on a free port, verify headless, tear down after baking — is identical to the visual-parameter workflow below.

## Control patterns

Pick controls by what the decision actually is.

| Decision type | Control |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 53 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE