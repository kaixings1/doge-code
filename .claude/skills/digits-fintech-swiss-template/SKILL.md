---
name: digits-fintech-swiss-template
description: "Digits Fintech Swiss Template — Digits Fintech Swiss Template 相关功能和最佳实践"
  黑/暖纸/霓虹绿对比的瑞士网格金融科技幻灯片模板。当用户要求在一个 HTML 文件中提供具有严格模块化布局、粗体数字卡片、克制动效和键盘/点击导航的高级数据故事幻灯片时使用。
triggers:
  - "swiss fintech template"
  - "data-driven finance deck"
  - "neon lime editorial grid"
  - "high contrast strategy slides"
  - "数字金融瑞士风模板"
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
  example_prompt: "Create a Swiss-grid fintech strategy deck with modular data cards, lime accents, and clean keyboard navigation."
  capabilities_required:
    - file_write
---

# Digits Fintech Swiss Template

A premium three-slide live-artifact template for data-storytelling in a Swiss grid language.

## Resource map

```text
digits-fintech-swiss-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

## Workflow

1. Start from `assets/template.html` and keep the three-slide structure intact.
2. Replace copy and metric values while preserving card hierarchy and reading order.
3. Keep interactions:
   - Prev / Next buttons
   - keyboard navigation (`ArrowLeft` / `ArrowRight`)
   - dot navigation
4. Keep motion subtle (slide fade + tiny hover lift only).
5. Keep the file self-contained (inline CSS/JS) with no sandbox-hostile APIs.

## Output contract

Emit one concise orientation sentence and then one HTML artifact:

```xml
<artifact identifier="digits-fintech-swiss" type="text/html" title="Digits Fintech Swiss Deck">
<!doctype html>
<html>...</html>
</artifact>
```
