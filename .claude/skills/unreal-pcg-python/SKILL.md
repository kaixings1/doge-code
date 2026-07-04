---
name: unreal-pcg-python
description: "Unreal PCG Python — Unreal Engine PCG Python 集成指南"
  Guide for Unreal Engine 5.x PCG (Procedural Content Generation) Python integration.
  Covers the PCGPythonInterop plugin, the Execute Python Script node, PCG Python API
  (PCGComponent, PCGBlueprintElement, PCGSpatialData, PCGPointData), editor automation,
  custom PCG nodes via Python, and known limitations.
  Use when the user asks about PCG Python, PCGPythonInterop, Execute Python Script node,
  Python scripting for procedural generation, automating PCG graphs with Python,
  or creating custom PCG nodes with Python/Blueprint.
---

# Unreal Engine PCG Python 集成指南

## 概述

Python 在**两个层面**与 UE5 的程序化内容生成（PCG）框架交互：

1. **PCGPythonInterop 插件**（UE 5.5+，Beta）——一个仅编辑器的 PCG 图节点（"Execute Python Script"），在图中间运行 Python 代码。
2. **PCG Python API**（UE 5.2+）——标准的 `unreal` 模块类（`PCGComponent`、`PCGBlueprintElement` 等），用于编辑器自动化和自定义节点逻辑。

**重要提示：** 所有 PCG Python 功能**仅限编辑器**。Python 无法在打包版本或游戏运行时中运行。

## 官方文档

| 资源 | URL |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 48 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE