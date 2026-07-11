---
name: 写作者记忆
description: "面向写作者的智能记忆系统——追踪角色、关系、场景和主题，跨会话持久化。"
参数-hint: "init|char|rel|scene|查询|validate|synopsis|status|export [args]"
level: 7
triggers:
  - "writer-memory"
  - "writer memory"
  - "写作者记忆"
  - "writer memory"
  - "角色记忆"
  - "写作记忆系统"
---

# 写作者记忆（Writer Memory）— 写作者智能记忆系统

专为创意写作者设计的跨会话持久化记忆系统，尤其擅长韩国叙事工作流。

## 概述

Writer Memory 在 Claude 会话中为小说创作者维护上下文，追踪以下五类要素：

- **角色（Characters）**：情感弧线、态度、对话语气、说话方式
- **世界观（World）**：设定、规则、氛围、约束条件
- **关系（Relationships）**：角色动态与随时间演变
- **场景（Scenes）**：场景构图、叙事语气、情感标签
- **主题（Themes）**：情感主题、作者意图

所有数据持久化存储于 `.writer-memory/memory.json`，支持 git 友好协作。

## 命令

| 命令 | 作用 |