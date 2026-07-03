---
name: unreal-pcg-python
description: "Unreal Pcg Python — Unreal Pcg Python 相关功能和最佳实践"
  Guide for Unreal Engine 5.x PCG (Procedural Content Generation) Python integration.
  Covers the PCGPythonInterop plugin, the Execute Python Script node, PCG Python API
  (PCGComponent, PCGBlueprintElement, PCGSpatialData, PCGPointData), editor automation,
  custom PCG nodes via Python, and known limitations.
  Use when the user asks about PCG Python, PCGPythonInterop, Execute Python Script node,
  Python scripting for procedural generation, automating PCG graphs with Python,
  or creating custom PCG nodes with Python/Blueprint.
---

# Unreal Engine PCG Python Integration Guide

## Overview

Python interacts with UE5's Procedural Content Generation (PCG) framework at **two levels**:

1. **PCGPythonInterop Plugin** (UE 5.5+, Beta) -- An editor-only PCG graph node ("Execute Python Script") that runs Python code mid-graph.
2. **PCG Python API** (UE 5.2+) -- Standard `unreal` module classes (`PCGComponent`, `PCGBlueprintElement`, etc.) for editor automation and custom node logic.

**Important:** All PCG Python functionality is **editor-only**. Python cannot run in packaged builds or at game runtime.

## Official Documentation

| Resource | URL |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 48 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE