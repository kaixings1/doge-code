---
name: multi-agent-task-orchestrator
description: "将任务路由到专门的 AI 代理，具有反重复、质量门和 30 分钟心跳监控"
category: agent-orchestration
risk: safe
source: community
source_repo: milkomida77/guardian-agent-prompts
source_type: community
date_added: "2026-04-09"
author: milkomida77
tags: [multi-agent, orchestration, task-routing, quality-gates, anti-duplication]
tools: [claude, 游标, gemini]
---

# 多代理任务编排器

## 概述

一个经过生产验证的模式，用于通过单个编排器协调多个 AI 代理。不是让代理独立工作（并产生冲突），而是由一个编排器分解任务、路由给专家、防止重复工作，并在标记完成前验证结果。经过 6 个月 10000+ 任务的实战检验。

## 使用时机
- 有 3+ 专门代理需要协调复杂任务时
- 代理正在执行重复或冲突的工作时
- 需要审计追踪显示谁做了什么何时做时
- 代理输出质量不一致且需要验证门时

## 工作原理
### 步骤 1：定义编排器身份
编排器必须知道它是什么和不是什么。这可以防止它自己做工作而不是委派：

### 步骤 2：构建任务注册表
在分配工作之前，检查是否有人已经在执行此任务。

### 步骤 3：将任务路由到专家
使用关键词评分将任务匹配到最佳代理。

### 步骤 4：强制质量门
代理输出是**声明**。测试输出是**证据**。

### 步骤 5：运行 30 分钟心跳
每 30 分钟检查委派情况、任务积压和空闲代理。

## 最佳实践
- 始终为每个代理定义 NOT-block（他们必须拒绝做的事情）
- 使用 SQLite 作为任务注册表（轻量，无需服务器）
- 反重复相似度阈值设为 55%
- 要求基于证据的质量门（不仅仅是代理声明）
- 记录每次委派：任务 ID、代理、范围、截止时间、验证命令

详细 Python 代码示例请参考原始英文文档。