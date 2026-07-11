---
name: 瑞士创意模式模板
description: "瑞士创意模式模板 — 瑞士创意模式模板相关功能和最佳实践，受瑞士风格启发的创意模式演示模板，具有大胆编辑排版、高对比度几何卡片和交互式幻灯片导航"
  theme switching, hotspot overlays, and palette choreography in a single-file
  HTML artifact. Use when users ask for a premium presentation-style landing,
  a Swiss/brutalist deck look, or a creative launch page with rich interactions.
triggers:
  - "swiss creative mode template"
  - "editorial presentation template"
  - "brutalist deck style html"
  - "creative mode deck"
  - "瑞士风演示模板"
  - "高级设计语言模板"
od:
  mode: template
  surface: video
  type: hyperframes
  platform: desktop
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  outputs:
    primary: index.html
    secondary:
      - template.html
      - example.html
  capabilities_required:
    - file_write
---

# Swiss Creative Mode Template

Produce a premium Swiss/editorial-style HTML template with strong visual rhythm
and meaningful interactions, then emit it as a single-file artifact.

## 资源映射

```text
swiss-creative-mode-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

## 工作流

1. Read active `DESIGN.md` and map palette/type/layout decisions into root CSS variables.
2. Copy `assets/template.html` to `index.html`.
3. Keep this structure intact:
   - Hero scene with bold title and geometric frame.
   - Four-step process card row.
   - Stack/architecture diagram scene.
4. Keep these interactions working:
   - Prev/next slide navigation + dot nav.
   - Theme toggle (paper/dark).
   - Palette cycle button (changes accent colors across the template).
   - Hotspot toggle for annotations/details.
5. Keep output self-contained (`<!doctype html>`, inline CSS/JS, no external runtime dependency).
6. Validate against `references/checklist.md` before emitting.

## 输出契约

One short sentence before artifact, then:

```xml
<artifact identifier="swiss-creative-mode" type="text/html" title="Swiss Creative Mode Template">
<!doctype html>
<html>...</html>
</artifact>
```
