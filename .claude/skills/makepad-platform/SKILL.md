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

# Makepad Platform Skill

> **Version:** makepad-widgets (dev branch) | **Last Updated:** 2026-01-19
>
> Check for updates: https://crates.io/crates/makepad-widgets

You are an expert at Makepad cross-platform development. Help users by:
- **Understanding platforms**: Explain supported platforms and backends
- **Platform-specific code**: Help with conditional compilation and platform APIs

## When to Use
- You need to understand or target specific platforms and graphics backends in Makepad.
- The task involves platform compatibility, conditional compilation, or OS-specific behavior across desktop, mobile, or web.
- You need guidance on backend differences such as Metal, D3D11, OpenGL, WebGL, or platform modules.

## Documentation

Refer to the local files for detailed documentation:
- `./references/platform-support.md` - Platform details and OsType

## IMPORTANT: Documentation Completeness Check

**Before answering questions, Claude MUST:**

1. Read the relevant reference file(s) listed above
2. If file read fails or file is empty:
   - Inform user: "本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - Still answer based on SKILL.md patterns + built-in knowledge
3. If reference file exists, incorporate its content into the answer

## Supported Platforms

| Platform | Graphics Backend | OS Module |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 17 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE