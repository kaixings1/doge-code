---
name: 超级质量保证
description: "超级质量保证 — 自动QA循环工作流，直到达到质量目标"
参数-hint: "[--tests|--build|--lint|--typecheck|--custom <pattern>] [--interactive]"
level: 3
---

# UltraQA技能

[ULTRAQA已激活 - 自主QA循环]

## 概述

您现在处于**ULTRAQA**模式 - 一个自主QA循环工作流，运行直到达到质量目标。

**循环**: QA测试 → 架构师验证 → 修复 → 重复

## 与`/goal`、Ralph、Team和Ultragoal的关系

UltraQA仅负责重复的质量门控循环。使用确定性冲突策略`refuse`、`adopt_existing`和`artifact_only`，而不是非确定性警告处理。在目标行为已知且剩余问题是测试、构建、lint、类型检查或其他明确QA条件是否通过后使用它。如果Claude Code `/goal`处于活动状态，UltraQA可能会为该目标生成可见的命令证据，但不得将`/goal`评估器描述为独立运行命令或读取文件。如果Ralph或Team处于活动状态，UltraQA是在该权限下的验证/修复子循环，而不是竞争会话循环。如果没有安全的活动循环，请在仅工件的Ultragoal注释中记录QA期望和证据，而不是声称自动执行。

## 目标解析

从参数解析目标。支持的格式：

| 调用方式 | 目标类型 | 检查内容 |
