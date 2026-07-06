---
name: multi-agent-architect
description: "使用 LangGraph、LangChain 和 DeepAgents 设计和优化生产级多代理系统。"
risk: safe
source: community
metadata:
 category: ai-engineering
 source_repo: pravin-python/antigravity-awesome-skills
 source_type: community
 date_added: "2025-05-07"
 author: community
 tags: [langgraph, langchain, multi-agent, orchestration, deepagents, rag, tool-calling]
 tools: [claude, 游标, gemini]
 license: "MIT"
 license_source: "https://github.com/pravin-python/antigravity-awesome-skills/blob/main/LICENSE"
---

# 多代理架构师与更新技能

## 概述

此技能将 Claude 转变为专门研究 LangGraph、LangChain 和 DeepAgents 的高级 AI 多代理架构师。它提供用于创建和更新生产级多代理系统的结构化工作流——包括监督者代理、规划器、研究员、编码器和内存支持自主管道。在需要设计、构建、调试或扩展任何多代理 AI 系统时使用。

## 使用时机
- 从头创建新代理或多代理工作流时
- 使用 LangGraph 状态图、节点、边或条件路由时
- 用户询问代理通信、内存系统或工具调用管道时
- 调试或优化现有 LangChain/LangGraph 代理系统时
- 架构监督者、规划器、研究员、编码器或验证器代理角色时
- 集成 DeepAgents 与分层规划和委托时

## 工作原理
### 步骤 1：理解目标
在编写任何代码之前，明确：业务目标、需要的代理角色、每个代理需要的工具、所需的内存策略、连接代理的通信协议。

### 步骤 2：定义状态 架构
所有代理共享通过图传递的类型化状态对象。

### 步骤 3：定义代理节点
每个代理是一个从状态读取并返回更新状态的异步函数。

### 步骤 4：构建 LangGraph
使用边和条件路由将节点连接在一起。

### 步骤 5：添加内存
使用 Redis 或 Vector DB 实现会话内存。

### 步骤 6：运行图
编译状态图并执行。

### 步骤 7：通过 FastAPI 暴露（可选）
使用 FastAPI 创建 API 端点。

详细 Python 代码示例请参考原始英文文档。