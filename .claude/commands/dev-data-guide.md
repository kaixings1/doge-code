---
alwaysApply: false
---

# Continue 开发数据（Dev Data）指南

## 概述

开发数据（dev data）记录了开发者如何与 LLM 辅助开发工具交互的详细信息。与基础遥测不同，dev data 包含完整软件开发工作流中的大量细节，包括代码上下文、用户交互和开发模式。

## 核心架构

### 主要实现文件

- **`/core/data/log.ts`**：主 `DataLogger` 类 - 用于事件日志和远程传输的单例
- **`/packages/config-yaml/src/schemas/data/`**：所有事件类型的 schema 定义

### 存储位置

- **默认存储**：`~/.continue/dev_data/`
- **事件文件**：`~/.continue/dev_data/{version}/{eventName}.jsonl`

## 事件类型与 Schema

### 核心事件类型

1. **`tokensGenerated`**：LLM token 用量跟踪
2. **`autocomplete`**：代码补全交互
3. **`chatInteraction`**：基于聊天的开发协助
4. **`editInteraction`**：代码编辑会话
5. **`editOutcome`**：编辑操作的结果
6. **`nextEditOutcome`**：Next Edit 功能的产出
7. **`chatFeedback`**：用户对 AI 响应的反馈
8. **`toolUsage`**：工具交互统计
9. **`quickEdit`**：快速编辑功能的使用

### Schema 版本管理

- **版本 0.1.0**：初始 schema 实现
- **版本 0.2.0**：当前 schema，字段和元数据更丰富
- **Schema 文件**：位于 `/packages/config-yaml/src/schemas/data/`

### 基础 Schema 结构

所有事件都继承自一个基础 schema（`/packages/config-yaml/src/schemas/data/base.ts`）：

```typescript
{
  eventName: string,
  schema: string,
  timestamp: string,
  userId: string,
  userAgent: string,
  selectedProfileId: string
}
```

## 关键集成点

### 自动补全系统

- **文件**：`/core/autocomplete/util/AutocompleteLoggingService.ts`
- **用途**：跟踪代码补全的接受/拒绝、计时和缓存命中
- **集成**：补全显示/被接受时由补全引擎调用

### 聊天界面

- **集成**：聊天交互通过 `DataLogger.logDevData()` 记录
- **数据**：包含提示词、响应、上下文和用户反馈
- **隐私**：可配置为排除代码内容

### 编辑功能

- **文件**：`/extensions/vscode/src/extension/EditOutcomeTracker.ts`, `/core/nextEdit/NextEditLoggingService.ts`
- **用途**：跟踪编辑建议、接受率和结果
- **集成**：嵌入编辑工作流以捕获用户决策

### LLM Token 跟踪

- **文件**：`/core/llm/index.ts`
- **用途**：跟踪所有 LLM 提供方的 token 用量
- **存储**：SQLite 数据库，便于高效查询和报告

## 配置与定制

### 配置结构

Dev data 通过 Continue 配置中的 `data` 块配置：

```yaml
data:
  - name: "Local Development Data"
    destination: "file:///Users/developer/.continue/dev_data"
    schema: "0.2.0"
    level: "all"
    events: ["autocomplete", "chatInteraction", "editOutcome"]

  - name: "Team Analytics"
    destination: "https://analytics.yourcompany.com/api/events"
    schema: "0.2.0"
    level: "noCode"
    apiKey: "your-api-key-here"
    events: ["tokensGenerated", "toolUsage"]
```

### 配置选项

- **`destination`**：数据发送到哪里（`file://` 为本地，`http://`/`https://` 为远程）
- **`schema`**：使用的 schema 版本（`"0.1.0"` 或 `"0.2.0"`）
- **`level`**：数据详细程度（`"all"` 包含代码，`"noCode"` 排除代码内容）
- **`events`**：要收集的事件类型数组
- **`apiKey`**：远程端点的认证

### 隐私控制

- **`"all"` 级别**：包含代码内容（前缀、后缀、补全）
- **`"noCode"` 级别**：排除代码内容，仅元数据和指标
- **本地优先**：数据始终存储在本地，远程传输是可选的

## 修改 Dev Data

### 添加新事件类型

1. **创建 schema**：在 `/packages/config-yaml/src/schemas/data/` 中添加新事件 schema
2. **更新索引**：添加到 `/packages/config-yaml/src/schemas/data/index.ts` 中的 schema 聚合器
3. **实现日志**：在相关服务文件中添加日志调用
4. **更新版本**：如果有破坏性变更，考虑提升 schema 版本

### 修改现有事件

1. **Schema 变更**：更新 `/packages/config-yaml/src/schemas/data/` 中的 schema 文件
2. **向后兼容**：确保变更不破坏现有的数据消费方
3. **版本管理**：对破坏性变更递增 schema 版本
4. **充分测试**：用现有数据验证 schema 变更

### 添加新的日志点

1. **导入 DataLogger**：`import { DataLogger } from "core/data/log"`
2. **记录事件**：调用 `DataLogger.getInstance().logDevData(eventName, data)`
3. **遵循模式**：以现有日志服务为范例
4. **校验数据**：确保记录的数据符合 schema 要求

### 调试 Dev Data 问题

1. **检查本地存储**：验证文件是否在 `~/.continue/dev_data/` 中创建
2. **校验 schema**：确保事件数据符合预期的 schema 格式
3. **检查配置**：核对 Continue 配置中的 `data` 块
4. **测试端点**：验证远程端点可达并能接受数据

## 最佳实践

### 添加新事件时

- 遵循事件类型的现有命名约定
- 包含足够的上下文以便分析，同时不过度暴露敏感数据
- 考虑隐私影响，尊重用户配置的级别
- 添加恰当的错误处理和日志

### 修改 Schema 时

- 尽可能保持向后兼容
- 详尽记录 schema 变更
- 考虑对现有数据消费方的影响
- 用真实开发数据测试

### 集成日志时

- 使用单例模式：`DataLogger.getInstance()`
- 在用户工作流的恰当位置记录事件
- 尊重用户隐私设置和配置
- 优雅地处理错误，不干扰用户体验

## 常见模式

### 基于服务的日志

大多数 dev data 日志遵循服务模式：

```typescript
export class FeatureLoggingService {
  private dataLogger = DataLogger.getInstance();

  logFeatureUsage(data: FeatureUsageData) {
    this.dataLogger.logDevData("featureUsage", data);
  }
}
```

### 事件驱动日志

事件通常在关键交互点记录：

```typescript
// When user accepts autocomplete
onAutocompleteAccepted(completion: CompletionData) {
  AutocompleteLoggingService.getInstance().logAutocompleteAccepted(completion);
}
```

本指南为理解和处理 Continue 的 dev data 系统提供了基础。做任何改动时，始终优先考虑用户隐私并遵循既有模式。
