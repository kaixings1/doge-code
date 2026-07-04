---
name: makepad-dsl
description: "Makepad Dsl — Makepad Dsl 相关功能和最佳实践"
  CRITICAL: Use for Makepad DSL syntax and inheritance. Triggers on:
  makepad dsl, live_design, makepad inheritance, makepad prototype,
  "<Widget>", "Foo = { }", makepad object, makepad property,
  makepad DSL 语法, makepad 继承, makepad 原型, 如何定义 makepad 组件
risk: safe
source: community
---

# Makepad DSL 技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Rust `makepad-widgets` crate DSL 方面的专家。通过以下方式帮助用户：
- **编写代码**：按照下面的模式生成 DSL 代码
- **回答问题**：解释 DSL 语法、继承、属性覆盖

## 使用时机
- 您需要有关 Makepad `live_design!` 语法、对象定义或继承模式的帮助。
- 任务涉及微件声明、属性覆盖、原型或 DSL 组合规则。
- 您需要 Makepad DSL 特定的示例，而非通用的 Rust 语法建议。

## 文档

有关详细文档，请参考本地文件：
- `./references/dsl-syntax.md` - 完整的 DSL 语法参考
- `./references/inheritance.md` - 继承模式和示例

## 重要提示：文档完整性检查

**在回答问题之前，Claude 必须：**

1. 阅读上面列出的相关参考文件
2. 如果文件读取失败或文件为空：
   - 告知用户："本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - 仍基于 SKILL.md 模式 + 内置知识进行回答
3. 如果参考文件存在，将其内容纳入答案

## 关键模式

### 1. 匿名对象

```rust
{
    width: 100.0
    height: 50.0
    color: #FF0000
}
```

### 2. 命名对象（原型）

```rust
MyButton = {
    width: Fit
    height: 40.0
    padding: 10.0
    draw_bg: { color: #333333 }
}
```

### 3. 继承与覆盖

```rust
PrimaryButton = <MyButton> {
    draw_bg: { color: #0066CC }  // 覆盖父级颜色
    draw_text: { color: #FFFFFF }  // 添加新属性
}
```

### 4. 微件实例化

```rust
<View> {
    // 继承自 View 原型
    width: Fill
    height: Fill

    <Button> { text: "Click Me" }  // 子微件
    <Label> { text: "Hello" }      // 另一个子微件
}
```

### 5. 将 Rust 结构链接到 DSL

```rust
// 在 live_design! 中
MyWidget = {{MyWidget}} {
    // DSL 属性
    width: 100.0
}

// 在 Rust 中
#[derive(Live, LiveHook, Widget)]
pub struct MyWidget {
    #[deref] view: View,
    #[live] width: f64,
}
```

## DSL 语法参考

| 语法 | 描述 | 示例 |
|------|------|------|