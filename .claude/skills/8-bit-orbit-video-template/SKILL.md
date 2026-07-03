---
name: 8-bit-orbit-video-template
description: "8 Bit Orbit Video Template — 8 Bit Orbit Video Template 相关功能和最佳实践"
  基于 Hyperframes 的复古像素风格视频模板。用于需要高保真多场景 HTML 转视频、高级转场、交互式预览控制及即用渲染样式的场景。
triggers:
  - "hyperframes video template"
  - "video template"
  - "pixel motion deck"
  - "retro presentation video"
  - "Hyperframes 模板"
  - "视频模板"
  - "像素风动效"
od:
  mode: template
  surface: video
  type: hyperframes
  platform: desktop
  preview:
    type: html
    entry: example.html
    reload: debounce-100
  design_system:
    requires: false
  outputs:
    primary: index.html
    secondary:
      - template.html
      - example.html
  example_prompt: "Create a 3-page Hyperframes video deck in 8-bit retro style with advanced transitions, rich motion, and each page under 3 seconds."
  capabilities_required:
    - file_write
---

# Hyperframes 视频模板

以高质量模板模式交付 Hyperframes 作品，自带默认演示展示和确定性的时间轴行为。

## 资源地图

```text
8-bit-orbit-video-template/
├── SKILL.md
├── assets/
│   └── template.html
├── references/
│   └── checklist.md
└── example.html
```

`example.html` 使用的渲染 MP4 演示作品托管于
`https://repo-assets.open-design.ai/resources/videos/skills/8-bit-orbit-video-template/default-showcase.mp4`。

## 工作流

1. 将 `assets/template.html` 复制为 `index.html`。
2. 保留 3 场景结构和转场节奏，除非用户明确要求更改节奏。
3. 在保持复古像素风格的前提下，自定义标题、副标题行、标签和调色板。
4. 遵守时间限制：每个场景的停留时间不超过 3 秒。
5. 保持生成作品的确定性行为（不使用未播种的随机数，不使用无限 GSAP 循环）。
6. 将所有代码保持在一个 HTML 文件内，使用内联 CSS/JS。
7. 输出作品前，对照 `references/checklist.md` 进行验证。

## 输出约定

```xml
<artifact identifier="8-bit-orbit-video-template" type="text/html" title="8-Bit Orbit Video Template">
<!doctype html>
<html>...</html>
</artifact>
```
