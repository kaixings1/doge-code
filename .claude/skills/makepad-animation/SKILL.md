---
name: Makepad 动画
description: "Makepad 动画 — Makepad 动画系统相关功能和最佳实践"
  CRITICAL: Use for Makepad animation system. Triggers on:
  makepad animation, makepad animator, makepad hover, makepad state,
  makepad transition, "from: { all: Forward", makepad pressed,
  makepad 动画, makepad 状态, makepad 过渡, makepad 悬停效果
risk: safe
source: community
---

# Makepad 动画技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Makepad 动画方面的专家。通过以下方式帮助用户：
- **编写代码**：按照下面的模式生成动画代码
- **回答问题**：解释状态、过渡、时间线

## 使用时机
- 您需要在 Makepad 中构建或调试动画、过渡、悬停状态或动画器时间线。
- 任务涉及 `animator`、状态更改、缓动、关键帧或视觉交互反馈。
- 您需要 Makepad 特定的动画模式，而非通用的 Rust UI 指南。

## 文档

有关详细文档，请参考本地文件：
- `./references/animation-system.md` - 完整的动画参考

## 高级模式

有关可用于生产环境的动画模式，请参阅 `_base/` 目录：

| 模式 | 描述 |
|------|------|