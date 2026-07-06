---
name: design-taste-frontend
description: "适用于构建高品质前端界面，具有严格的设计品味、校准的色彩、响应式布局和动效规则的情况。"
category: frontend
risk: safe
source: community
source_repo: Leonxlnx/taste-skill
source_type: community
date_added: "2026-04-17"
author: Leonxlnx
tags: [frontend, design, ui, react]
tools: [claude, 游标, codex, antigravity]
---
# 高自主性前端技能

## 何时使用

- 当用户要求创建、改进或审查具有强烈设计品味和反通用约束的前端 UI 时使用。
- 当 React、Next.js、Tailwind、动效、组件状态、排版、间距、颜色或响应式行为需要高级设计判断时使用。
- 当输出必须覆盖常见的 LLM UI 偏见时使用，例如居中主视觉、紫色渐变、过度使用卡片、糟糕的状态和脆弱的布局。

## 限制

- 此技能提供前端设计和实施指导；它不能替代项目特定的产品需求、可访问性审查或用户测试。
- 在将生成的 UI 视为生产就绪之前，请验证目标存储库中的框架版本、已安装的依赖项、响应式行为和构建输出。
- 当现有产品、品牌系统或平台约定需要不同的视觉方向时，不要强制应用这些设计规则。


## 1. 活动基线配置
* 设计变化度: 8 (1=完美对称, 10=艺术性混乱)
* 动效强度: 6 (1=静态/无动效, 10=电影级/魔法物理)
* 视觉密度: 4 (1=艺术画廊/通风, 10=飞行员座舱/密集数据)

**AI 指令:** 所有生成的标准基线严格设置为这些值 (8, 6, 4)。不要要求用户编辑此文件。否则，始终倾听用户：根据他们在聊天提示中明确请求的内容动态调整这些值。使用这些基线（或用户覆盖的）值作为您的全局变量，以驱动第 3 节到第 7 节中的特定逻辑。

## 2. 默认架构和约定
除非用户明确指定不同的技术栈，否则请遵守这些结构约束以保持一致性：

* **依赖验证 [强制]:** 在导入任何第三方库（例如 `framer-motion`、`lucide-react`、`zustand`）之前，您必须检查 `package.json`。如果缺少包，您必须在提供代码之前输出安装命令（例如 `npm install package-name`）。**绝不**假设库存在。
* **Framework & Interactivity:** React or Next.js. 默认 to Server Components (`RSC`).
    * **RSC SAFETY:** Global state works ONLY in Client Components. In Next.js, wrap providers in a `"use client"` component.
    * **INTERACTIVITY ISOLATION:** If Sections 4 or 7 (Motion/Liquid Glass) are active, the specific interactive UI component MUST be extracted as an isolated leaf component with `'use client'` at the very top. Server Components must exclusively render static layouts.
* **State Management:** Use local `useState`/`useReducer` for isolated UI. Use global state strictly for deep prop-drilling avoidance.
* **Styling Policy:** Use Tailwind CSS (v3/v4) for 90% of styling.
    * **TAILWIND VERSION LOCK:** Check `package.json` first. Do not use v4 syntax in v3 projects.
    * **T4 CONFIG GUARD:** For v4, do NOT use `tailwindcss` plugin in `postcss.config.js`. Use `@tailwindcss/postcss` or the Vite plugin.
* **ANTI-EMOJI POLICY [CRITICAL]:** NEVER use emojis in code, markup, text content, or alt text. Replace symbols with high-quality icons (Radix, Phosphor) or clean SVG primitives. Emojis are BANNED.
* **Responsiveness & Spacing:**
  * Standardize breakpoints (`sm`, `md`, `lg`, `xl`).
  * Contain page layouts using `max-w-[1400px] mx-auto` or `max-w-7xl`.
  * **Viewport Stability [CRITICAL]:** NEVER use `h-screen` for full-height Hero sections. ALWAYS use `min-h-[100dvh]` to prevent catastrophic layout jumping on mobile browsers (iOS Safari).
  * **Grid over Flex-Math:** NEVER use complex flexbox percentage math (`w-[calc(33%-1rem)]`). ALWAYS use CSS Grid (`grid grid-cols-1 md:grid-cols-3 gap-6`) for reliable structures.
* **Icons:** You MUST use exactly `@phosphor-icons/react` or `@radix-ui/react-icons` as the import paths (check installed version). Standardize `strokeWidth` globally (e.g., exclusively use `1.5` or `2.0`).


## 3. 设计工程指令（偏见纠正）
LLMs 对特定的 UI 陈词滥调模式有统计偏见。使用这些工程规则主动构建高级界面：

**规则 1：确定性排版**
* **展示/标题:** 默认使用 `text-4xl md:text-6xl tracking-tighter leading-none`。
    * **反垃圾:** 不鼓励为"高级"或"创意"氛围使用 `Inter`。强制使用独特字符，如 `Geist`、`Outfit`、`Cabinet Grotesk` 或 `Satoshi`。
    * **技术 UI 规则:** 仪表板/软件 UI 严格禁止使用衬线字体。对于这些上下文，仅使用高端无衬线字体配对（`Geist` + `Geist Mono` 或 `Satoshi` + `JetBrains Mono`）。
* **正文/段落:** 默认使用 `text-base text-gray-600 leading-relaxed max-w-[65ch]`。

**规则 2：颜色校准**
* **约束:** 最多 1 个强调色。饱和度 < 80%。
* **LILA 禁令:** 严格禁止"AI 紫色/蓝色"美学。没有紫色按钮发光，没有霓虹渐变。使用绝对中性基础（Zinc/Slate）搭配高对比度、单一的强调色（例如 Emerald、Electric Blue 或 Deep Rose）。
* **颜色一致性:** 在整个输出中坚持一个调色板。不要在同一项目中在暖灰色和冷灰色之间波动。

**Rule 3: Layout Diversification**
* **ANTI-CENTER BIAS:** Centered Hero/H1 sections are strictly BANNED when `LAYOUT_VARIANCE > 4`. Force "Split Screen" (50/50), "Left Aligned content/Right Aligned asset", or "Asymmetric White-space" structures.

**Rule 4: Materiality, Shadows, and "Anti-Card Overuse"**
* **DASHBOARD HARDENING:** For `VISUAL_DENSITY > 7`, generic card containers are strictly BANNED. Use logic-grouping via `border-t`, `divide-y`, or purely negative space. Data metrics should breathe without being boxed in unless elevation (z-index) is functionally required.
* **Execution:** Use cards ONLY when elevation communicates hierarchy. When a shadow is used, tint it to the background hue.

**Rule 5: Interactive UI States**
* **Mandatory Generation:** LLMs naturally generate "static" successful states. You MUST implement full interaction cycles:
  * **Loading:** Skeletal loaders matching layout sizes (avoid generic circular spinners).
  * **Empty States:** Beautifully composed empty states indicating how to populate data.
  * **Error States:** Clear, inline error reporting (e.g., forms).
  * **Tactile Feedback:** On `:active`, use `-translate-y-[1px]` or `scale-[0.98]` to simulate a physical push indicating success/action.

**Rule 6: Data & Form Patterns**
* **Forms:** Label MUST sit above input. Helper text is optional but should exist in markup. Error text below input. Use a standard `gap-2` for input blocks.

## 4. 创造性主动性（反垃圾实施）
为了积极对抗通用的 AI 设计，系统地将这些高端编码概念作为您的基线实施：
* **"液态玻璃"折射:** 当需要玻璃态效果时，超越 `backdrop-blur`。添加 1px 内边框 (`border-white/10`) 和微妙的内阴影 (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`) 以模拟物理边缘折射。
* **磁性微物理（如果 MOTION_INTENSITY > 5）:** 实现略微向鼠标光标拉动的按钮。**关键:** 绝不使用 React `useState` 进行磁性悬停或连续动画。仅使用 Framer Motion 的 `useMotionValue` 和 `useTransform` 在 React 渲染循环之外，以防止移动端性能崩溃。
* **Perpetual Micro-Interactions:** When `MOTION_INTENSITY > 5`, embed continuous, infinite micro-animations (Pulse, Typewriter, Float, Shimmer, Carousel) in standard components (avatars, status dots, backgrounds). Apply premium Spring Physics (`type: "spring", stiffness: 100, damping: 20`) to all interactive elements—no linear easing.
* **Layout Transitions:** 始终 utilize Framer Motion's `layout` and `layoutId` props for smooth re-ordering, resizing, and shared element transitions across state changes.
* **Staggered Orchestration:** Do not mount lists or grids instantly. Use `staggerChildren` (Framer) or CSS cascade (`animation-delay: calc(var(--index) * 100ms)`) to create sequential waterfall reveals. **CRITICAL:** For `staggerChildren`, the Parent (`variants`) and Children MUST reside in the identical Client Component tree. If data is fetched asynchronously, pass the data as props into a centralized Parent Motion wrapper.

## 5. PERFORMANCE GUARDRAILS
* **DOM Cost:** Apply grain/noise filters exclusively to fixed, pointer-event-none pseudo-elements (e.g., `fixed inset-0 z-50 pointer-events-none`) and NEVER to scrolling containers to prevent continuous GPU repaints and mobile performance degradation.
* **Hardware Acceleration:** 绝不 animate `top`, `left`, `width`, or `height`. Animate exclusively via `transform` and `opacity`.
* **Z-Index Restraint:** NEVER spam arbitrary `z-50` or `z-10` unprompted. Use z-indexes strictly for systemic layer contexts (Sticky Navbars, Modals, Overlays).

## 6. 技术参考（旋钮定义）

### 设计变化度（等级 1-10）
* **1-3（可预测）：** Flexbox `justify-center`、严格的 12 列对称网格、相等的内边距。
* **4-7（偏移）：** 使用 `margin-top: -2rem` 重叠、多样的图像宽高比（例如 4:3 旁边是 16:9）、左对齐标题覆盖居中对齐数据。
* **8-10（非对称）：** 瀑布流布局、CSS Grid 使用分数单位（例如 `grid-template-columns: 2fr 1fr 1fr`）、巨大的空区域（`padding-left: 20vw`）。
* **移动端覆盖：** 对于等级 4-10，`md:` 以上的任何非对称布局必须在视口 `< 768px` 上积极回退到严格的单列布局（`w-full`、`px-4`、`py-8`），以防止水平滚动和布局破坏。

### 动效强度（等级 1-10）
* **1-3（静态）：** 无自动动画。仅 CSS `:hover` 和 `:active` 状态。
* **4-7（流体 CSS）：** 使用 `transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)`。对入场使用 `animation-delay` 级联。严格专注于 `transform` 和 `opacity`。谨慎使用 `will-change: transform`。
* **8-10（高级编排）：** 复杂的滚动触发显示或视差。使用 Framer Motion 钩子。绝不使用 `window.addEventListener('scroll')`。

### 视觉密度（等级 1-10）
* **1-3（艺术画廊模式）：** 大量空白。巨大的部分间距。一切感觉非常昂贵和干净。
* **4-7（日常应用模式）：** 标准 Web 应用的正常间距。
* **8-10（驾驶舱模式）：** 微小的内边距。没有卡片框；只有 1px 线来分隔数据。一切都 packed。**强制：** 对所有数字使用等宽字体（`font-mono`）。

## 7. AI 特征（禁止模式）
为了确保高级、非通用的输出，除非明确要求，否则必须严格避免这些常见的 AI 设计特征：

### 视觉和 CSS
* **无霓虹/外发光：** 不要使用默认的 `box-shadow` 发光或自动发光。使用内边框或微妙的着色阴影。
* **无纯黑：** 绝不使用 `#000000`。使用 Off-Black、Zinc-950 或 Charcoal。
* **无过度饱和的强调色：** 淡化强调色以优雅地与中性色融合。
* **无过多的渐变文本：** 不要对大标题使用文本填充渐变。
* **无自定义鼠标光标：** 它们已经过时，会损害性能/可访问性。

### 排版
* **无 Inter 字体：** 禁止。使用 `Geist`、`Outfit`、`Cabinet Grotesk` 或 `Satoshi`。
* **无过大的 H1：** 第一个标题不应该大喊。通过字重和颜色控制层次，而不仅仅是巨大的尺度。
* **衬线字体约束条件：** 仅对创意/编辑设计使用衬线字体。**绝不**在干净的仪表板上使用衬线字体。

### 布局和间距
* **完美对齐和间距：** 确保内边距和外边距在数学上是完美的。避免浮动元素出现 awkward gaps。
* **无 3 列卡片布局：** 通用的"水平 3 个相等卡片"功能行被禁止。使用 2 列锯齿形、非对称网格或水平滚动替代方案。

### 内容和数据（"Jane Doe" 效果）
* **无通用名称：** "John Doe"、"Sarah Chan" 或 "Jack Su" 被禁止。使用高度创造性的、逼真的名称。
* **无通用头像：** 不要对头像使用标准 SVG "egg" 或 Lucide 用户图标。使用创造性的、可信的照片占位符或特定样式。
* **无虚假数字：** 避免可预测的输出，如 `99.99%`、`50%` 或基本电话号码（`1234567`）。使用有机的、杂乱的数据（`47.2%`、`+1 (312) 847-1928`）。
* **无初创公司垃圾名称：** "Acme"、"Nexus"、"SmartFlow"。发明高级的、上下文相关的品牌名称。
* **无填充词：** 避免 AI 文案陈词滥调，如 "Elevate"、"Seamless"、"Unleash" 或 "Next-Gen"。使用具体的动词。

### 外部资源和组件
* **无损坏的 Unsplash 链接：** 不要使用 Unsplash。使用绝对、可靠的占位符，如 `https://picsum.photos/seed/{random_string}/800/600` 或 SVG UI 头像。
* **shadcn/ui 自定义：** 您可以使用 `shadcn/ui`，但绝不要在其通用默认状态下使用。您必须自定义半径、颜色和阴影以匹配高级项目美学。
* **生产就绪的清洁度：** 代码必须极其干净、视觉上引人注目、难忘，并且在每个细节上都经过精心润色。

## 8. 创意武器库（高端灵感）
不要默认使用通用 UI。从这个高级概念库中汲取灵感，确保输出在视觉上引人注目且令人难忘。在适当的情况下，使用 **GSAP (ScrollTrigger/Parallax)** 进行复杂的滚动叙事，或使用 **ThreeJS/WebGL** 进行 3D/Canvas 动画，而不是基础的 CSS 动效。**关键：** 绝不将 GSAP/ThreeJS 与 Framer Motion 混合在同一个组件树中。UI/Bento 交互默认使用 Framer Motion。GSAP/ThreeJS 仅用于独立的整页滚动叙事或画布背景，并包装在严格的 useEffect 清理块中。

### 标准英雄范式
* 停止在深色图像上放置居中的文本。尝试非对称英雄部分：文本清晰地左对齐或右对齐。背景应该具有高质量的、相关的图像，带有微妙的风格化淡出（根据浅色或深色模式，优雅地变暗或变亮为背景色）。

### 导航和菜单
* **Mac OS Dock 放大：** 导航栏在边缘；图标在悬停时流畅缩放。
* **磁性按钮：** 物理上向鼠标拉动的按钮。
* **黏液菜单：** 子项目像粘性液体一样从主按钮分离。
* **Dynamic Island：** 一个药丸形状的 UI 组件，变形以显示状态/警报。
* **上下文径向菜单：** 一个在点击坐标处精确扩展的圆形菜单。
* **浮动快速拨号：** 一个 FAB，弹出成一条弯曲的次要操作线。
* **大型菜单显示：** 全屏下拉菜单，错开淡入复杂内容。

### 布局和网格
* **便当盒网格：** 非对称的、基于磁贴的分组（例如 Apple 控制中心）。
* **瀑布布局：** 没有固定行高的交错网格（例如 Pinterest）。
* **色度网格：** 网格边框或磁贴显示微妙的、连续动画的颜色渐变。
* **分屏滚动：** 两个屏幕部分在滚动时向相反方向滑动。
* **窗帘显示：** 一个英雄部分在中间像窗帘一样在滚动时分开。

### Cards & Containers
* **Parallax Tilt Card:** A 3D-tilting card tracking the mouse coordinates.
* **Spotlight Border Card:** Card borders that illuminate dynamically under the 游标.
* **Glassmorphism Panel:** True frosted glass with inner refraction borders.
* **Holographic Foil Card:** Iridescent, rainbow light reflections shifting on hover.
* **Tinder Swipe Stack:** A physical stack of cards the user can swipe away.
* **Morphing Modal:** A button that seamlessly expands into its own full-screen dialog container.

### Scroll-Animations
* **Sticky Scroll Stack:** Cards that stick to the top and physically stack over each other.
* **Horizontal Scroll Hijack:** Vertical scroll translates into a smooth horizontal gallery pan.
* **Locomotive Scroll Sequence:** Video/3D sequences where framerate is tied directly to the scrollbar.
* **Zoom Parallax:** A central background image zooming in/out seamlessly as you scroll.
* **Scroll Progress Path:** SVG vector lines or routes that draw themselves as the user scrolls.
* **Liquid Swipe Transition:** Page transitions that wipe the screen like a viscous liquid.

### Galleries & Media
* **Dome Gallery:** A 3D gallery feeling like a panoramic dome.
* **Coverflow Carousel:** 3D carousel with the center focused and edges angled back.
* **Drag-to-Pan Grid:** A boundless grid you can freely drag in any compass direction.
* **Accordion Image Slider:** Narrow vertical/horizontal image strips that expand fully on hover.
* **Hover Image Trail:** The mouse leaves a trail of popping/fading images behind it.
* **Glitch Effect Image:** Brief RGB-channel shifting digital distortion on hover.

### 排版和文本
* **动态跑马灯：** 无限文本带，在滚动时反向或加速。
* **文本遮罩显示：** 巨大的排版作为视频背景的透明窗口。
* **文本乱码效果：** 矩阵风格的字符解码，在加载或悬停时进行。
* **圆形文本路径：** 文本沿旋转的圆形路径弯曲。
* **渐变描边动画：** 带有描边文本，渐变沿描边连续运行。
* **动态排版网格：** 一个字母网格，在鼠标靠近时躲避或旋转。

### 微交互和效果
* **粒子爆炸按钮：** 成功的 CTA 按钮破碎成粒子。
* **液态下拉刷新：** 移动端重新加载指示器，像分离的水滴一样起作用。
* **骨架闪烁：** 在占位符框上移动的移动光线反射。
* **方向感知悬停按钮：** 悬停填充从鼠标进入的确切一侧进入。
* **涟漪点击效果：** 视觉波浪从点击坐标精确涟漪。
* **动画 SVG 线条绘制：** 实时绘制自己轮廓的向量。
* **网格渐变背景：** 有机的、熔岩灯般的动画颜色斑点。
* **镜头模糊深度：** 动态焦点模糊背景 UI 层，以突出前景操作。

## 9. "动效引擎"便当 paradigm
生成现代 SaaS 仪表板或功能部分时，必须使用以下"Bento 2.0"架构和动效哲学。这超越了静态卡片，并强制执行一种严重依赖持续物理的"Vercel-core meets Dribbble-clean"美学。

### A. 核心设计哲学
* **美学：** 高级、极简和功能化。
* **调色板：** 背景为 `#f9fafb`。卡片是纯白色（`#ffffff`），带有 1px 边框 `border-slate-200/50`。
* **表面：** 对所有主要容器使用 `rounded-[2.5rem]`。应用"扩散阴影"（一个非常轻的、广泛扩散的阴影，例如 `shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]`）以创造深度而不杂乱。
* **排版：** 严格的 `Geist`、`Satoshi` 或 `Cabinet Grotesk` 字体栈。对标题使用微妙的字距（`tracking-tight`）。
* **标签：** 标题和描述必须放置在卡片**外部和下方**，以保持干净的、画廊式的展示。
* **像素完美：** 在卡片内部使用慷慨的 `p-8` 或 `p-10` 内边距。

### B. 动效引擎规格（持续动效）
所有卡片必须包含**"持续微交互。"** 使用以下 Framer Motion 原则：
* **弹簧物理：** 无线性缓动。使用 `type: "spring", stiffness: 100, damping: 20` 获得高级、沉重感。
* **布局过渡：** 大量使用 `layout` 和 `layoutId` 属性，以确保平滑的重新排序、调整大小和共享元素状态转换。
* **无限循环：** 每张卡片必须有一个"活动状态"无限循环（脉冲、打字机、浮动或轮播），以确保仪表板感觉"活着"。
* **性能：** 将动态列表包装在 `<AnimatePresence>` 中并优化为 60fps。**性能关键：** 任何持续动效或无限循环必须被记忆化（React.memo）并完全隔离在它自己的微观客户端组件中。绝不触发父布局中的重新渲染。

### C. 5 卡片原型（微动画规格）
在构建 Bento 网格时实施这些特定的微动画（例如，第 1 行：3 列 | 第 2 行：2 列分割 70/30）：
1. **智能列表：** 一个具有无限自动排序循环的垂直项目堆栈。项目使用 `layoutId` 交换位置，模拟 AI 实时优先处理任务。
2. **命令输入：** 一个具有多步打字机效果的搜索/AI 栏。它循环遍历复杂提示，包括闪烁的图形用户界面和具有闪烁加载渐变的"处理"状态。
3. **实时状态：** 具有"呼吸"状态指示器的调度界面。包括一个弹窗通知徽章，以"过冲"弹簧效果出现，停留 3 秒并消失。
4. **宽数据流：** 数据卡片或指标的水平"无限轮播"。确保循环是无缝的（使用 `x: ["0%", "-100%"]`），速度感觉毫不费力。
5. **上下文 UI（聚焦模式）：** 一个对文本块进行错开高亮动画的文档视图，随后是带有微图标的浮动操作工具栏的"浮动进入"。

## 10. FINAL PRE-FLIGHT CHECK
Evaluate your code against this matrix before outputting. This is the **last** 过滤器 you apply to your logic.
- [ ] Is global state used appropriately to avoid deep prop-drilling rather than arbitrarily?
- [ ] Is mobile layout collapse (`w-full`, `px-4`, `max-w-7xl mx-auto`) guaranteed for high-variance designs?
- [ ] Do full-height sections safely use `min-h-[100dvh]` instead of the bugged `h-screen`?
- [ ] Do `useEffect` animations contain strict cleanup functions?
- [ ] Are empty, loading, and error states provided?
- [ ] Are cards omitted in favor of spacing where possible?
- [ ] Did you strictly isolate CPU-heavy perpetual animations in their own Client Components?
