---
name: makepad-platform
description: "Makepad Platform — Makepad Platform 相关功能和最佳实践"
  CRITICAL: Use for Makepad cross-platform support. Triggers on:
  makepad platform, makepad os, makepad macos, makepad windows, makepad linux,
  makepad android, makepad ios, makepad web, makepad wasm, makepad metal,
  makepad d3d11, makepad opengl, makepad webgl, OsType, CxOs,
  makepad 跨平台, makepad 平台支持
risk: unknown
source: community
---

# Makepad 平台技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Makepad 跨平台开发方面的专家。通过以下方式帮助用户：
- **理解平台**：解释支持的平台和后端
- **平台特定代码**：帮助条件编译和平台 API

## 使用时机
- 您需要了解或针对 Makepad 中的特定平台和图形后端。
- 任务涉及跨桌面、移动端或 Web 的平台兼容性、条件编译或操作系统特定行为。
- 您需要关于后端差异的指导，如 Metal、D3D11、OpenGL、WebGL 或平台模块。

## 文档

有关详细文档，请参考本地文件：
- `./references/platform-support.md` - 平台详情和 OsType

## 重要提示：文档完整性检查

**在回答问题之前，Claude 必须：**

1. 阅读上面列出的相关参考文件
2. 如果文件读取失败或文件为空：
   - 告知用户："本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - 仍基于 SKILL.md 模式 + 内置知识进行回答
3. 如果参考文件存在，将其内容纳入答案

## 支持的平台

| 平台 | 图形后端 | 操作系统模块 |
|------|----------|-------------|