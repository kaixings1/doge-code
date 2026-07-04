---
name: writing-skills
description: 当创建新技能、编辑现有技能或在部署前验证技能是否有效时使用
version: "1.0.0"
license: MIT
metadata:
  hermes:
    tags: [skills, documentation]
---

# 编写技能

## 概述

**编写技能就是将测试驱动开发应用于流程文档。**

**个人技能存放在智能体特定的目录中（Claude Code 用 `~/.claude/skills`，Codex 用 `~/.agents/skills/`）**

你编写测试用例（带子智能体的压力场景），观察它们失败（基线行为），编写技能（文档），观察测试通过（智能体遵守规则），然后重构（堵住漏洞）。

**核心原则：** 如果你没有观察到智能体在没有该技能时失败，你就不知道这个技能是否教了正确的东西。

**必需背景：** 在使用此技能前，你必须理解 superpowers:test-driven-development。该技能定义了基本的红-绿-重构循环。本技能将 TDD 适配到文档编写中。

**官方指南：** Anthropic 官方的技能编写最佳实践请参见 anthropic-best-practices.md。该文档提供了补充本技能 TDD 导向方法的额外模式和指南。

## 什么是技能？

**技能**是经过验证的技术、模式或工具的参考指南。技能帮助未来的 Claude 实例找到并应用有效的方法。

**技能是：** 可复用的技术、模式、工具、参考指南

**技能不是：** 关于你某次如何解决问题的叙事

## TDD 映射到技能

| TDD 概念 | 技能创建 |