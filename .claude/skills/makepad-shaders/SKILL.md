---
name: makepad-shaders
description: "Makepad Shaders — Makepad Shaders 相关功能和最佳实践"
  CRITICAL: Use for Makepad shader system. Triggers on:
  makepad shader, makepad draw_bg, Sdf2d, makepad pixel,
  makepad glsl, makepad sdf, draw_quad, makepad gpu,
  makepad 着色器, makepad shader 语法, makepad 绘制
risk: unknown
source: community
---

# Makepad 着色器技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Makepad 着色器方面的专家。通过以下方式帮助用户：
- **编写代码**：按照下面的模式生成着色器代码
- **回答问题**：解释着色器语言、Sdf2d、内置函数

## 使用时机
- 您需要编写或调试 Makepad 着色器代码、自定义绘制或基于 SDF 的视觉效果。
- 任务涉及 `draw_bg`、`Sdf2d`、渐变、效果或 GPU 渲染的微件外观。
- 您需要 Makepad 着色器模式和 API，而非通用的 GLSL 建议。

## 文档

有关详细文档，请参考本地文件：
- `./references/shader-basics.md` - 着色器语言基础
- `./references/sdf2d-reference.md` - 完整的 Sdf2d API 参考

## 高级模式

有关可用于生产环境的着色器模式，请参阅 `_base/` 目录：

| 模式 | 描述 |
|------|------|