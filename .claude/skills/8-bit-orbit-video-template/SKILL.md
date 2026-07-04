---
name: 8-bit-orbit-video-template
description: "8位轨道视频模板 — 8位轨道视频模板相关功能和最佳实践"
  基于 Hyperframes 的复古像素风格视频模板。用于需要高保真多场景 HTML 转视频、高级转场、交互式预览控制及即用渲染样式的场景。
triggers:
  - "hyperframes视频模板"
  - "视频模板"
  - "像素动效演示"
  - "复古演示视频"
  - "Hyperframes模板"
  - "视频模板"
  - "像素风动效"
od:
  模式: 模板
  表面: 视频
  类型: hyperframes
  平台: 桌面
  预览:
    类型: html
    入口: example.html
    重新加载: debounce-100
  设计系统:
    需要: false
  输出:
    主要: index.html
    次要:
      - template.html
      - example.html
  示例提示: "创建一个3页的Hyperframes视频演示，采用8位复古风格，具有高级转场、丰富的动画效果，每页不超过3秒。"
  所需能力:
    - 文件写入
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
