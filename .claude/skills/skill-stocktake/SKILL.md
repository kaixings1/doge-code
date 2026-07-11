---
name: 技能盘点
description: "用于对 Claude 技能（Skills）和命令进行质量审计。支持快速扫描（Quick Scan，仅针对变更的技能）和全面盘点（Full Stocktake）模式，并通过子智能体（subagent）进行顺序批处理评估。"
origin: ECC
---

# 技能盘点

斜杠命令（`/skill-stocktake`），使用质量检查清单 + AI 综合判断来审计所有 Claude 技能（Skills）和命令。支持两种模式：针对最近变更技能的快速扫描（Quick Scan），以及用于完整审查的全面盘点（Full Stocktake）。

## 作用范围（Scope）

该命令的目标路径**相对于调用它的目录**：

| 路径 | 描述 |
