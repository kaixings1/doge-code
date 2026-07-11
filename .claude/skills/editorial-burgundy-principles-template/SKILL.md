---
name: 编辑酒红原则模板相关功能和最佳实践
description: "Editorial Burgundy Principles Template — 编辑酒红原则模板相关功能和最佳实践"
  编辑工作室酒红/腮红/哑金配色的演示文稿模板。
  当用户要求高级宣言或文化幻灯片时使用，包含药丸标签、
  大型排版声明、原则卡片和引导式键盘/点击导航。
triggers:
  - "editorial burgundy template"
  - "studio salon deck"
  - "principles manifesto slides"
  - "pink burgundy premium presentation"
  - "酒红粉金编辑风模板"
od:
  mode: template
  surface: video
  type: hyperframes
  platform: desktop
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  outputs:
    primary: index.html
    secondary:
      - template.html
      - example.html
  example_prompt: "Create a premium editorial deck in burgundy and blush with a tag cloud slide and an eight-principles card grid."
  capabilities_required:
    - file_write
---

# Editorial Burgundy Principles Template

A three-slide editorial deck for culture narratives, strategy storytelling, and internal manifestos.

## 资源映射

```text
editorial-burgundy-principles-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

## 工作流

1. Start from `assets/template.html`.
2. Keep the 3-slide sequence:
   - numeric headline
   - studio tags + title lockup
   - eight-principles card grid
3. Replace copy while preserving card and tag hierarchy.
4. Keep interactions:
   - Prev / Next buttons
   - dot navigation
   - keyboard navigation (`ArrowLeft` / `ArrowRight`)
5. Keep HTML self-contained and sandbox-safe.

## 输出契约

Emit one concise orientation sentence and one HTML artifact:

```xml
<artifact identifier="editorial-burgundy-principles" type="text/html" title="Editorial Burgundy Principles Deck">
<!doctype html>
<html>...</html>
</artifact>
```
