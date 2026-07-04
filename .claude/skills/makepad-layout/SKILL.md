---
name: makepad-layout
description: "Makepad Layout — Makepad Layout 相关功能和最佳实践"
  CRITICAL: Use for Makepad layout system. Triggers on:
  makepad layout, makepad width, makepad height, makepad flex,
  makepad padding, makepad margin, makepad flow, makepad align,
  Fit, Fill, Size, Walk, "how to center in makepad",
  makepad 布局, makepad 宽度, makepad 对齐, makepad 居中
risk: safe
source: community
---

# Makepad 布局技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Makepad 布局系统方面的专家。通过以下方式帮助用户：
- **编写代码**：按照下面的模式生成布局代码
- **回答问题**：解释布局概念、尺寸调整、流向方向

## 使用时机
- 您需要在 Makepad UI 中调整大小、对齐或定位微件。
- 任务涉及 `Walk`、`Align`、`Fit`、`Fill`、内边距、间距或容器流向配置。
- 您需要 Makepad 特定的布局解决方案来实现居中、响应式或组合布局。

## 文档

有关详细文档，请参考本地文件：
- `./references/layout-system.md` - 完整的布局参考
- `./references/core-types.md` - Walk、Align、Margin、Padding 类型

## 重要提示：文档完整性检查

**在回答问题之前，Claude 必须：**

1. 阅读上面列出的相关参考文件
2. 如果文件读取失败或文件为空：
   - 告知用户："本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - 仍基于 SKILL.md 模式 + 内置知识进行回答
3. 如果参考文件存在，将其内容纳入答案

## 关键模式

### 1. 基本布局容器

```rust
<View> {
    width: Fill
    height: Fill
    flow: Down
    padding: 16.0
    spacing: 8.0

    <Label> { text: "Item 1" }
    <Label> { text: "Item 2" }
}
```

### 2. 居中内容

```rust
<View> {
    width: Fill
    height: Fill
    align: { x: 0.5, y: 0.5 }

    <Label> { text: "Centered" }
}
```

### 3. 水平行布局

```rust
<View> {
    width: Fill
    height: Fit
    flow: Right
    spacing: 10.0
    align: { y: 0.5 }  // 垂直居中项目

    <Button> { text: "Left" }
    <View> { width: Fill }  // 弹性间距
    <Button> { text: "Right" }
}
```

### 4. 固定 + 弹性布局

```rust
<View> {
    width: Fill
    height: Fill
    flow: Down

    // 固定头部
    <View> {
        width: Fill
        height: 60.0
    }

    // 弹性内容
    <View> {
        width: Fill
        height: Fill  // 占据剩余空间
    }
}
```

## 布局属性参考

| 属性 | 类型 | 描述 |
|------|------|------|