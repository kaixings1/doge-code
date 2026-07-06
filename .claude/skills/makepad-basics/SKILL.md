---
name: makepad-basics
description: "Makepad Basics — Makepad Basics 相关功能和最佳实践"
  CRITICAL: Use for Makepad getting started and app structure. Triggers on:
  makepad, makepad getting started, makepad tutorial, live_design!, app_main!,
  makepad project 设置, makepad hello world, "how to create makepad app",
  makepad 入门, 创建 makepad 应用, makepad 教程, makepad 项目结构
risk: unknown
source: "https://github.com/makepad/makepad"
---

# Makepad 基础技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Rust `makepad-widgets` crate 方面的专家。通过以下方式帮助用户：
- **编写代码**：按照下面的模式生成 Rust 代码
- **回答问题**：解释概念、排查问题、引用文档

## 使用时机
- 您需要开始使用 Makepad 或了解基本的应用结构和样板代码。
- 任务涉及项目设置、`live_design!`、`app_main!` 或首个屏幕的应用接线。
- 在进入更具体的布局、微件或着色器主题之前，您需要基础的 Makepad 指导。

## 文档

有关详细文档，请参考本地文件：
- `./references/app-structure.md` - 完整的应用样板和结构
- `./references/event-handling.md` - 事件处理模式

## 重要提示：文档完整性检查

**在回答问题之前，Claude 必须：**

1. 阅读上面列出的相关参考文件
2. 如果文件读取失败或文件为空：
   - 告知用户："本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - 仍基于 SKILL.md 模式 + 内置知识进行回答
3. 如果参考文件存在，将其内容纳入答案

## 关键模式

### 1. 基本应用结构

```rust
use makepad_widgets::*;

live_design! {
    use link::theme::*;
    use link::shaders::*;
    use link::widgets::*;

    App = {{App}} {
        ui: <Root> {
            main_window = <Window> {
                body = <View> {
                    width: Fill, height: Fill
                    flow: Down

                    <Label> { text: "Hello Makepad!" }
                }
            }
        }
    }
}

app_main!(App);

#[derive(Live, LiveHook)]
pub struct App {
    #[live] ui: WidgetRef,
}

impl LiveRegister for App {
    fn live_register(cx: &mut Cx) {
        crate::makepad_widgets::live_design(cx);
    }
}

impl AppMain for App {
    fn handle_event(&mut self, cx: &mut Cx, event: &Event) {
        self.ui.handle_event(cx, event, &mut Scope::empty());
    }
}
```

### 2. Cargo.toml 设置

```toml
[package]
name = "my_app"
version = "0.1.0"
edition = "2024"

[dependencies]
makepad-widgets = { git = "https://github.com/makepad/makepad", branch = "dev" }
```

### 3. 处理按钮点击

```rust
impl AppMain for App {
    fn handle_event(&mut self, cx: &mut Cx, event: &Event) {
        let actions = self.ui.handle_event(cx, event, &mut Scope::empty());

        if self.ui.button(id!(my_button)).clicked(&actions) {
            log!("Button clicked!");
        }
    }
}
```

### 4. 访问和修改微件

```rust
// 获取微件引用
let label = self.ui.label(id!(my_label));
label.set_text("Updated text");

let input = self.ui.text_input(id!(my_input));
let text = input.text();
```

## API 参考表

| 宏/类型 | 描述 | 示例 |
|---------|------|------|