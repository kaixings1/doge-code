---
name: unreal-thirdparty
description: "Unreal Thirdparty — Unreal Thirdparty 相关功能和最佳实践"
  Expert guide for integrating third-party C/C++ libraries into Unreal Engine 5.x projects and plugins.
  Covers static linking, dynamic linking (DLL/SO/dylib), Build.cs configuration, ModuleType.External,
  delay loading, runtime dependency staging, wrapping patterns, cross-platform considerations
  (Windows/macOS/Linux), ABI compatibility, RTTI/exceptions, header inclusion with
  THIRD_PARTY_INCLUDES_START/END, and common pitfalls. Use when the user asks about adding
  external libraries, third-party code, linking .lib/.a/.dll/.so/.dylib files, Build.cs
  PublicAdditionalLibraries, PublicDelayLoadDLLs, RuntimeDependencies, ModuleType.External,
  wrapping a C++ library for UE, FPlatformProcess::GetDllHandle, cross-compiling libraries
  for UE on Linux, or troubleshooting linker errors / DLL load failures with third-party code.
---

# Unreal Engine Third-Party Library Integration -- C++ Guide

## Official Documentation (always consult for latest details)

| Source | URL |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 47 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE