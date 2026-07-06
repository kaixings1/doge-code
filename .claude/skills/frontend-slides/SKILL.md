---
name: frontend-slides
description: 从零开始或通过转换 PowerPoint 文件创建 stunning 的动画丰富 HTML 演示文稿。
risk: safe
source: https://github.com/zarazhangrui/frontend-slides
date_added: "2026-03-07"
---

# 前端幻灯片

创建零依赖、动画丰富的 HTML 演示文稿，完全在浏览器中运行。

## 何时使用此技能

- 当用户要求从头开始创建演示文稿、幻灯片或推介时使用。
- 当用户想要将现有的 PPT 或 PPTX 文件转换为基于 Web 的演示文稿时使用。
- 当设计需要精确适应视口的视觉丰富、动画 HTML 内容时使用。

## 核心原则

1. **零依赖项** — 具有内联 CSS/JS 的单个 HTML 文件。无需 npm，无需构建工具。
2. **展示而非讲述** — 生成视觉预览，而非抽象选择。人们通过看到来发现他们想要什么。
3. **独特设计** — 没有通用的"AI 垃圾"。每个演示文稿都必须感觉是定制的。
4. **视口适配（不可协商）** — 每张幻灯片必须精确适应 100vh。幻灯片内绝无滚动。内容溢出？分割成多张幻灯片。

## 设计美学

您倾向于趋同于通用的"分布上"输出。在前端设计中，这创造了用户所说的"AI 垃圾"美学。避免这种情况：制作有创意、独特的前端，令人惊喜和愉悦。

关注：

- 排版：选择美观、独特和有趣的字体。避免通用字体如 Arial 和 Inter；选择能提升前端美学的独特字体。
- 颜色与主题：致力于一致的美学。使用 CSS 变量保持一致性。具有鲜明强调色的主导颜色优于胆怯、均匀分布的调色板。从 IDE 主题和文化美学中汲取灵感。
- 动效：使用动画实现效果和微交互。优先为 HTML 使用纯 CSS 解决方案。可用时使用 React 的 Motion 库。专注于高影响力时刻：一个精心编排的页面加载，具有交错显示（animation-delay），比分散的微交互创造更多愉悦。
- 背景：创建氛围和深度，而不是默认使用纯色。分层 CSS 渐变，使用几何图案，或添加与整体美学匹配的上下文效果。

避免通用的 AI 生成美学：

- 过度使用的字体系列（Inter、Roboto、Arial、系统字体）
- 陈词滥调的色彩方案（特别是白色背景上的紫色渐变）
- 可预测的布局和组件模式
- 缺乏上下文特定特征的千篇一律设计

创造性地解释，并做出感觉真正为上下文设计的选择。在浅色和深色主题、不同字体、不同美学之间变化。您仍然倾向于在几代之间趋同于常见选择（例如 Space Grotesk）。避免这种情况：跳出框框思考至关重要！

## Viewport Fitting Rules

These invariants apply to EVERY slide in EVERY presentation:

- Every `.slide` must have `height: 100vh; height: 100dvh; overflow: hidden;`
- ALL font sizes and spacing must use `clamp(min, preferred, max)` — never fixed px/rem
- Content containers need `max-height` constraints
- Images: `max-height: min(50vh, 400px)`
- Breakpoints required for heights: 700px, 600px, 500px
- Include `prefers-reduced-motion` support
- 绝不 negate CSS functions directly (`-clamp()`, `-min()`, `-max()` are silently ignored) — use `calc(-1 * clamp(...))` instead

**When generating, read `viewport-base.css` and include its full contents in every presentation.**

### Content Density Limits Per Slide

| Slide Type    | Maximum Content                                           |
| ------------- | --------------------------------------------------------- |
| Title slide   | 1 heading + 1 subtitle + optional tagline                 |
| Content slide | 1 heading + 4-6 bullet points OR 1 heading + 2 paragraphs |
| Feature grid  | 1 heading + 6 cards maximum (2x3 or 3x2)                  |
| Code slide    | 1 heading + 8-10 lines of code                            |
| Quote slide   | 1 quote (max 3 lines) + attribution                       |
| Image slide   | 1 heading + 1 image (max 60vh height)                     |

**Content exceeds limits? Split into multiple slides. 绝不 cram, never scroll.**

---

## 阶段 0：检测模式

确定用户想要什么：

- **模式 A：新演示文稿** — 从头开始创建。转到阶段 1。
- **模式 B：PPT 转换** — 转换 .pptx 文件。转到阶段 4。
- **模式 C：增强** — 改进现有的 HTML 演示文稿。阅读它，理解它，增强。**遵循下面的模式 C 修改规则。**

### 模式 C：修改规则

增强现有演示文稿时，视口适配是最大的风险：

1. **在添加内容之前：** 计算现有元素，对照密度限制检查
2. **添加图像：** 必须具有 `max-height: min(50vh, 400px)`。如果幻灯片已有最大内容，分割成两张幻灯片
3. **添加文本：** 每张幻灯片最多 4-6 个要点。超出限制？分割成延续幻灯片
4. **任何修改后，验证：** `.slide` 有 `overflow: hidden`，新元素使用 `clamp()`，图像具有相对于视口的最大高度，内容在 1280x720 下适配
5. **主动重组：** 如果修改将导致溢出，自动分割内容并通知用户。不要等待被询问

**向现有幻灯片添加图像时：** 首先将图像移动到新幻灯片或减少其他内容。绝不添加图像而不检查现有内容是否已填满视口。

---

## 阶段 1：内容发现（新演示文稿）

**在单个 AskUserQuestion 调用中提出所有问题**，以便用户一次性填写所有内容：

**问题 1 — 目的** (标题: "目的"):
这个演示文稿是用于什么？选项：推介稿 / 教学教程 / 会议演讲 / 内部演示

**问题 2 — 长度** (标题: "长度"):
大约多少张幻灯片？选项：短 5-10 / 中 10-20 / 长 20+

**问题 3 — 内容** (标题: "内容"):
您有准备好的内容吗？选项：所有内容已准备好 / 粗略笔记 / 仅主题

**问题 4 — 内联编辑** (标题: "编辑"):
生成后需要在浏览器中直接编辑文本吗？选项：

- "是（推荐）" — 可以在浏览器中编辑文本，自动保存到 localStorage，导出文件
- "否" — 仅演示文稿，保持文件较小

**记住用户的编辑选择 — 这决定了阶段 3 中是否包含编辑相关代码。**

如果用户有内容，请他们分享。

### 步骤 1.2：图像评估（如果提供图像）

如果用户选择"无图像" → 跳转到阶段 2。

如果用户提供图像文件夹：

1. **扫描** — 列出所有图像文件（.png、.jpg、.svg、.webp 等）
2. **查看每个图像** — 使用 Read 工具（Claude 是多模态的）
3. **评估** — 对于每个：它显示什么，可用或不可用（附原因），它代表什么概念，主导颜色
4. **共同设计大纲** — 策划的图像与文本一起告知幻灯片结构。这不是"先计划幻灯片然后添加图像" — 从一开始就围绕两者设计（例如，3 个截图 → 3 个功能幻灯片，1 个徽标 → 标题/结束幻灯片）
5. **通过 AskUserQuestion 确认** (标题: "大纲"): "这个幻灯片大纲和图像选择看起来正确吗？" 选项：看起来不错 / 调整图像 / 调整大纲

**预览中的徽标：** 如果识别出可用的徽标，将其嵌入（base64）到阶段 2 的每个样式预览中 — 用户看到他们的品牌以三种不同的方式呈现。

---

## 阶段 2：样式发现

**这是"展示而非讲述"阶段。** 大多数人无法用语言表达设计偏好。

### 步骤 2.0：样式路径

询问他们想要如何选择（标题: "样式"）：

- "给我看选项"（推荐）— 根据情绪生成 3 个预览
- "我知道我想要什么" — 直接从预设列表中选择

**如果直接选择：** 显示预设选择器并跳转到阶段 3。可用预设定义在 [STYLE_PRESETS.md](STYLE_PRESETS.md) 中。

### 步骤 2.1：情绪选择（引导发现）

询问（标题: "氛围", 多选: true, 最多 2）：
观众应该有什么感觉？选项：

- 印象深刻/自信 — 专业、可信赖
- 兴奋/充满活力 — 创新、大胆
- 冷静/专注 — 清晰、周到
- 受启发/感动 — 情感化、难忘

### 步骤 2.2：生成 3 个样式预览

根据情绪，生成 3 个不同的单幻灯片 HTML 预览，展示排版、颜色、动画和整体美学。阅读 [STYLE_PRESETS.md](STYLE_PRESETS.md) 了解可用预设及其规格。

| 情绪                | 建议的预设                                  |
| ------------------- | -------------------------------------------------- |
| 印象深刻/自信 | Bold Signal, Electric Studio, Dark Botanical       |
| 兴奋/充满活力   | Creative Voltage, Neon Cyber, Split Pastel         |
| 冷静/专注        | Notebook Tabs, Paper & Ink, Swiss Modern           |
| 受启发/感动      | Dark Botanical, Vintage Editorial, Pastel Geometry |

将预览保存到 `.claude-design/slide-previews/`（style-a.html、style-b.html、style-c.html）。每个应该是独立的，约 50-100 行，显示一个动画标题幻灯片。

自动为每个用户打开预览。

### 步骤 2.3：用户选择

询问（标题: "样式"）：
您更喜欢哪个样式预览？选项：样式 A: [名称] / 样式 B: [名称] / 样式 C: [名称] / 混合元素

如果选择"混合元素"，询问具体要求。

---

## 阶段 3：生成演示文稿

使用阶段 1（文本，或文本 + 策划的图像）和阶段 2 的样式生成完整的演示文稿。

如果提供了图像，幻灯片大纲已经在步骤 1.2 中包含了它们。如果没有，CSS 生成的视觉效果（渐变、形状、图案）提供视觉兴趣 — 这是一个完全支持的一流路径。

**生成之前，阅读这些支持文件：**

- [html-template.md](html-template.md) — HTML 架构和 JS 功能
- [viewport-base.css](viewport-base.css) — 强制 CSS（完整包含）
- [animation-patterns.md](animation-patterns.md) — 所选感觉的动画参考

**关键要求：**

- 单个自包含的 HTML 文件，所有 CSS/JS 内联
- 在 `<style>` 块中包含 viewport-base.css 的全部内容
- 使用 Fontshare 或 Google Fonts 的字体 — 绝不使用系统字体
- 添加详细注释解释每个部分
- 每个部分都需要一个清晰的 `/* === SECTION NAME === */` 注释块

---

## 阶段 4：PPT 转换

转换 PowerPoint 文件时：

1. **提取内容** — 运行 `python scripts/extract-pptx.py <input.pptx> <output_dir>`（如果需要，安装 python-pptx：`pip install python-pptx`）
2. **与用户确认** — 展示提取的幻灯片标题、内容摘要和图像数量
3. **样式选择** — 进入阶段 2 进行样式发现
4. **生成 HTML** — 转换为所选样式，保留所有文本、图像（来自 assets/）、幻灯片顺序和演讲者备注（作为 HTML 注释）

---

## 阶段 5：交付

1. **清理** — 如果存在，删除 `.claude-design/slide-previews/`
2. **打开** — 使用 `open [filename].html` 在浏览器中启动
3. **总结** — 告诉用户：
   - 文件位置、样式名称、幻灯片数量
   - 导航：箭头键、空格键、滚动/滑动、点击导航点
   - 如何自定义：用于颜色的 `:root` CSS 变量、用于排版的字体链接、用于动画的 `.reveal` 类
   - 如果启用了内联编辑：悬停在左上角或按 E 进入编辑模式，点击任何文本进行编辑，Ctrl+S 保存

---

## Supporting Files

| File                                               | 目的                                                              | When to Read              |
| -------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| [STYLE_PRESETS.md](STYLE_PRESETS.md)               | 12 curated visual presets with colors, fonts, and signature elements | Phase 2 (style selection) |
| [viewport-base.css](viewport-base.css)             | Mandatory responsive CSS — copy into every presentation              | Phase 3 (generation)      |
| [html-template.md](html-template.md)               | HTML structure, JS features, code quality standards                  | Phase 3 (generation)      |
| [animation-patterns.md](animation-patterns.md)     | CSS/JS animation snippets and effect-to-feeling guide                | Phase 3 (generation)      |
| [scripts/extract-pptx.py](scripts/extract-pptx.py) | Python script for PPT content extraction                             | Phase 4 (conversion)      |

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必需的输入、权限、安全边界或成功标准，请停止并请求澄清。
