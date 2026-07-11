---
name: PPTX ↔ HTML 保真度审计
description: "PPTX ↔ HTML 保真度审计 — 比较 PowerPoint 渲染和 HTML 渲染的幻灯片布局、字体、间距和元素位置。检测偏离并提出修复方案。"
triggers:
  - "pptx fidelity"
  - "pptx audit"
  - "verify pptx"
  - "html to pptx"
---

# PPTX ↔ HTML 保真度审计

比较 PowerPoint 和 HTML 生成的幻灯片之间的呈现保真度。

## 使用场景

用户有：
- 呈现为 HTML 的幻灯片（使用 `<section class="slide">` 结构）
- 通过 python-pptx 从该 HTML 生成的 PPTX 文件
- 发现 PPTX 与 HTML 不一致——文本换行错位、字体不匹配、布局偏移

## 核心问题

PPTX 是固定布局、基于位置的格式。HTML 是流式、基于内容的格式。python-pptx 通过将内容放置在精确的 `(top, left)` 坐标上来弥合差距，这在**单一浏览器测试中**可能有效，但在实际演示中在不同屏幕宽高比下可能失效。