---
name: pptx-html-fidelity-audit
description: "Pptx Html Fidelity Audit — Pptx Html Fidelity Audit 相关功能和最佳实践"
triggers:
  - "pptx fidelity"
  - "pptx audit"
  - "ppt 跑掉"
  - "字型不對"
  - "footer overlap"
  - "verify pptx"
  - "html to pptx"
od:
  mode: utility
  scenario: engineering
---

# PPTX ↔ HTML Fidelity Audit

A repeatable workflow for catching the ways a `python-pptx` export silently drifts from its HTML source — and fixing them with a layout discipline that prevents the same regressions on the next pass.

## When this skill applies

The user has:

- A source HTML slide deck (typically a single-file deck with `<section class="slide">` blocks):

  ```html
  <section class="slide light">
    <div class="chrome">2026 · Q2 review</div>
    <span class="kicker">Pillar 03</span>
    <h2 class="h-xl">Shipping <em>velocity</em> doubled</h2>
    <p class="lead">…</p>
    <div class="foot">page 5 / 14</div>
  </section>
  ```

- A PPTX file generated from that deck via python-pptx (or similar).
- A suspicion (or visible evidence) that the PPTX doesn't match the HTML — text bleeding into the footer, italic words gone flat, hero slides not centered, sections cropped, tag styling lost.

If the user only has *one* of those two artifacts, this skill doesn't apply yet — first generate the missing one, or ask the user to provide it.

## Why this is hard (and why a skill helps)

PPTX is a fixed-canvas, absolute-positioned medium. HTML is a fluid, flow-based medium. A naive python-pptx export pins each block at hand-picked `(top, left)` coordinates, which works for the *first slide it was tested on* and silently fails for every other slide whose content has different intrinsic height. The result is the most common drift modes:

1. **Footer overflow** — content's `top + height` crosses into the footer row.
2. **Off-canvas content** — bottom of last block exceeds `7.5"` (16:9 canvas).
3. **Italic loss** — `<em>` in HTML never gets `run.font.italic = True`.
4. **Hero slides not centered** — vertical-stack slides use `MARGIN_TOP` instead of computing center.
5. **Box bounds intruding** — the text fits, but the *shape's bounding box* is oversized and visually crosses the rail.
6. **Tag/styling loss** — colored chrome rows, kicker uppercase tracking, mono-vs-serif assignments quietly fall back to defaults.

Every one of these is a *layout discipline* problem, not a content problem. Once you adopt the discipline, they stop happening.

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 30 MINUTES 16 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE