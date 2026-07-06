---
name: ai-agent-development
description: "用于构建自主代理、多代理系统和代理编排的 AI 代理开发工作流，支持 CrewAI、LangGraph 和自定义代理。"
category: granular-工作流-bundle
risk: safe
source: personal
date_added: "2026-02-27"
---

# AI 代理开发工作流

## 概述

构建 AI 代理的专业工作流，包括单一自主代理、多代理系统、代理编排、工具集成和人在回路模式。

## 何时使用此工作流

在以下情况下使用此工作流：
- 构建自主 AI 代理
- 创建多代理系统
- 实现代理编排
- 为代理添加工具集成
- 设置代理记忆

## 工作流阶段

### 阶段 1: 代理设计

#### 要调用的技能
- `ai-agents-architect` - 代理架构
- `autonomous-agents` - 自主模式

#### 操作
1. 定义代理目的
2. 设计代理能力
3. 规划工具集成
4. 设计记忆系统
5. 定义成功指标

#### 复制粘贴提示
```
使用 @ai-agents-architect 设计 AI 代理架构
```

### 阶段 2: 单代理实现

#### 要调用的技能
- `autonomous-agent-patterns` - 代理模式
- `autonomous-agents` - 自主代理

#### 操作
1. 选择代理框架
2. 实现代理逻辑
3. 添加工具集成
4. 配置记忆
5. 测试代理行为

#### 复制粘贴提示
```
使用 @autonomous-agent-patterns 实现单代理
```

### 阶段 3: 多代理系统

#### 要调用的技能
- `crewai` - CrewAI 框架
- `multi-agent-patterns` - 多代理模式

#### 操作
1. 定义代理角色
2. 设置代理通信
3. 配置编排
4. 实现任务委派
5. 测试协调

#### 复制粘贴提示
```
使用 @crewai 构建带角色的多代理系统
```

### 阶段 4: 代理编排

#### 要调用的技能
- `langgraph` - LangGraph 编排
- `工作流-orchestration-patterns` - 编排

#### 操作
1. 设计工作流图
2. 实现状态管理
3. 添加条件分支
4. 配置持久化
5. 测试工作流

#### 复制粘贴提示
```
使用 @langgraph 创建有状态的代理工作流
```

### 阶段 5: 工具集成

#### 要调用的技能
- `agent-tool-builder` - 工具构建
- `tool-design` - 工具设计

#### 操作
1. 识别工具需求
2. 设计工具接口
3. 实现工具
4. 添加错误处理
5. 测试工具使用

#### 复制粘贴提示
```
使用 @agent-tool-builder 创建代理工具
```

### 阶段 6: 记忆系统

#### 要调用的技能
- `agent-memory-systems` - 记忆架构
- `conversation-memory` - 对话记忆

#### 操作
1. 设计记忆结构
2. 实现短期记忆
3. 设置长期记忆
4. 添加实体记忆
5. 测试记忆检索

#### 复制粘贴提示
```
使用 @agent-memory-systems 实现代理记忆
```

### 阶段 7: 评估

#### 要调用的技能
- `agent-evaluation` - 代理评估
- `evaluation` - AI 评估

#### 操作
1. 定义评估标准
2. 创建测试场景
3. 衡量代理性能
4. 测试边界情况
5. 迭代改进

#### 复制粘贴提示
```
使用 @agent-evaluation 评估代理性能
```

## Agent 架构

```
User Input -> Planner -> Agent -> Tools -> Memory -> 响应
              |          |        |        |
         Decompose   LLM Core  Actions  Short/Long-term
```

## 质量门控

- [ ] 代理逻辑正常工作
- [ ] 工具已集成
- [ ] 记忆功能正常
- [ ] 编排已测试
- [ ] 评估通过

## 相关工作流捆绑包

- `ai-ml` - AI/ML 开发
- `rag-implementation` - RAG 系统
- `工作流-automation` - 工作流模式

## 局限性
- 仅当任务明确匹配上述范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
