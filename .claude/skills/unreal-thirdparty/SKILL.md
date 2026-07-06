---
name: unreal-thirdparty
description: "Unreal 第三方库 — Unreal Engine 第三方 C/C++ 库集成指南"
  Expert guide for integrating third-party C/C++ libraries into Unreal Engine 5.x projects and plugins.
  Covers static linking, dynamic linking (DLL/SO/dylib), Build.cs 配置, ModuleType.External,
  delay loading, runtime dependency staging, wrapping patterns, cross-platform considerations
  (Windows/macOS/Linux), ABI compatibility, RTTI/exceptions, header inclusion with
  THIRD_PARTY_INCLUDES_START/END, and common pitfalls. Use when the user asks about adding
  external libraries, third-party code, linking .lib/.a/.dll/.so/.dylib files, Build.cs
  PublicAdditionalLibraries, PublicDelayLoadDLLs, Runtime依赖项, ModuleType.External,
  wrapping a C++ library for UE, FPlatformProcess::GetDllHandle, cross-compiling libraries
  for UE on Linux, or 故障排除 linker errors / DLL load failures with third-party code.
---

# Unreal Engine 第三方库集成——C++ 指南

## 官方文档（始终查阅最新详情）

| 来源 | URL |