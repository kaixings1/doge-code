---
name: 版本：makepad-widgets（开发分支）| 最后更新：2026-01-1
description: "版本：makepad-widgets（开发分支）| 最后更新：2026-01-19 | 检查更新：https://crates.io/crates/makepad-widgets"
risk: safe
source: community
---

# Makepad 微件技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Makepad 微件方面的专家。通过以下方式帮助用户：
- **编写代码**：按照下面的模式生成微件代码
- **回答问题**：解释微件属性、变体和用法

## 使用时机
- 您需要使用 Makepad 中的核心或高级微件。
- 任务涉及微件选择、属性、变体、组合或微件特定行为。
- 您需要 `View`、`Button`、标签、富文本或其他 `makepad-widgets` 构建块的示例。

## 文档

有关详细文档，请参考本地文件：
- `./references/widgets-core.md` - 核心微件（View、Button、Label 等）
- `./references/widgets-advanced.md` - 辅助和高级微件
- `./references/widgets-richtext.md` - 富文本微件（Markdown、Html、TextFlow）

## 重要提示：文档完整性检查

**在回答问题之前，Claude 必须：**

1. 阅读上面列出的相关参考文件
2. 如果文件读取失败或文件为空：
   - 告知用户："本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - 仍基于 SKILL.md 模式 + 内置知识进行回答
3. 如果参考文件存在，将其内容纳入答案

## 关键模式

### 1. View（基本容器）

```rust
<View> {
    width: Fill
    height: Fill
    flow: Down
    padding: 16.0
    show_bg: true
    draw_bg: { color: #1A1A1A }

    <Label> { text: "Content" }
}
```

### 2. Button

```rust
<Button> {
    text: "Click Me"
    draw_bg: {
        color: #0066CC
        color_hover: #0088FF
        border_radius: 4.0
    }
    draw_text: {
        color: #FFFFFF
        text_style: { font_size: 14.0 }
    }
}
```

### 3. 带样式的 Label

```rust
<Label> {
    width: Fit
    height: Fit
    text: "Hello World"
    draw_text: {
        color: #FFFFFF
        text_style: {
            font_size: 16.0
            line_spacing: 1.4
        }
    }
}
```

### 4. Image

```rust
<Image> {
    width: 200.0
    height: 150.0
    source: dep("crate://self/resources/photo.png")
    fit: Contain
}
```

### 5. TextInput

```rust
<TextInput> {
    width: Fill
    height: Fit
    text: "Default value"
    draw_text: {
        text_style: { font_size: 14.0 }
    }
}
```

## 微件特征（来自源码）

```rust
pub trait WidgetNode: LiveApply {
    fn find_widgets(&self, path: &[LiveId], cached: WidgetCache, results: &mut WidgetSet);
    fn walk(&mut self, cx: &mut Cx) -> Walk;
    fn area(&self) -> Area;
    fn redraw(&mut self, cx: &mut Cx);
}

pub trait Widget: WidgetNode {
    fn handle_event(&mut self, cx: &mut Cx, event: &Event, scope: &mut Scope) {}
    fn draw_walk(&mut self, cx: &mut Cx2d, scope: &mut Scope, walk: Walk) -> DrawStep;
    fn draw(&mut self, cx: &mut Cx2d, scope: &mut Scope) -> DrawStep;
    fn widget(&self, path: &[LiveId]) -> WidgetRef;
}
```

## 所有内置微件（widgets/src/ 中的 84 个文件）

| 类别 | 微件 |
|------|------|