---
description: 通过充分研究和迭代创建详细实施计划
model: opus
---

# 实施计划

你的任务是通过交互式、迭代的过程创建详细的实施计划。你应该保持怀疑态度、全面考虑，并与用户协作以产生高质量的技术规范。

## 初始响应

当此命令被调用时：

1. **检查是否提供了参数**：
   - 如果作为参数提供了文件路径或工单引用，跳过默认消息
   - 立即**完整**读取任何提供的文件
   - 开始研究过程

2. **如果未提供参数**，回复：
```
I'll help you create a detailed implementation plan. Let me start by understanding what we're building.

Please provide:
1. The task/ticket description (or reference to a ticket file)
2. Any relevant context, constraints, or specific requirements
3. Links to related research or previous implementations

I'll analyze this information and work with you to create a comprehensive plan.

Tip: You can also invoke this command with a ticket file directly: `/create_plan thoughts/allison/tickets/eng_1234.md`
For deeper analysis, try: `/create_plan think deeply about thoughts/allison/tickets/eng_1234.md`
```

然后等待用户的输入。

## 过程步骤

### 第 1 步：上下文收集与初始分析

1. **立即并完整读取所有提及的文件**：
   - 工单文件（例如 `thoughts/allison/tickets/eng_1234.md`）
   - 研究文档
   - 相关实施计划
   - 任何提及的 JSON/数据文件
   - **重要**：使用 Read 工具时**不带** limit/offset 参数以读取整个文件
   - **关键**：在主上下文中自己读取这些文件之前，不要生成子任务
   - **绝不**部分读取文件——如果文件被提及，完整读取它

2. **生成初始研究任务以收集上下文**：
   在向用户提出任何问题之前，使用专门的代理并行研究：

   - 使用 **codebase-locator** 代理查找与工单/任务相关的所有文件
   - 使用 **codebase-analyzer** 代理理解当前实现如何工作
   - 如相关，使用 **thoughts-locator** 代理查找关于此功能的任何现有想法文档
   - 如果提及 Linear 工单，使用 **linear-ticket-reader** 代理获取完整详情

   这些代理将：
   - 找到相关的源文件、配置和测试
   - 追踪数据流和关键函数
   - 返回带 file:line 引用的详细解释

3. **读取研究任务识别的所有文件**：
   - 研究任务完成后，读取它们识别为相关的**所有**文件
   - 将它们完整读入主上下文
   - 这确保你在继续之前有完整的理解

4. **分析并验证理解**：
   - 将工单需求与实际代码交叉引用
   - 识别任何差异或误解
   - 记录需要验证的假设
   - 基于代码库现实确定真正的范围

5. **呈现有根据的理解和聚焦的问题**：
   ```
   Based on the ticket and my research of the codebase, I understand we need to [accurate summary].

   I've found that:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern or constraint discovered]
   - [Potential complexity or edge case identified]

   Questions that my research couldn't answer:
   - [Specific technical question that requires human judgment]
   - [Business logic clarification]
   - [Design preference that affects implementation]
   ```

   只问你确实无法通过代码调查回答的问题。

### 第 2 步：研究与发现

在获得初步澄清后：

1. **如果用户纠正任何误解**：
   - **不要**只是接受纠正
   - 生成新的研究任务以验证正确的信息
   - 读取他们提及的具体文件/目录
   - 只有在你亲自验证了事实后才继续

2. **创建研究待办列表**使用 TodoWrite 跟踪探索任务

3. **生成并行子任务进行全面研究**：
   - 创建多个 Task 代理以同时研究不同方面
   - 为每种研究类型使用正确的代理：

   **用于更深入的调查：**
   - **codebase-locator** —— 查找更具体的文件（例如"查找处理 [特定组件] 的所有文件"）
   - **codebase-analyzer** —— 理解实现细节（例如"分析 [系统] 如何工作"）
   - **codebase-pattern-finder** —— 查找我们可以模仿的类似功能

   **用于历史上下文：**
   - **thoughts-locator** —— 查找关于此区域的任何研究、计划或决策
   - **thoughts-analyzer** —— 从最相关的文档中提取关键洞见

   **用于相关工单：**
   - **linear-searcher** —— 查找类似问题或过去的实现

   每个代理都知道如何：
   - 找到正确的文件和代码模式
   - 识别要遵循的约定和模式
   - 查找集成点和依赖
   - 返回具体的 file:line 引用
   - 找到测试和示例

3. **等待所有子任务完成**后再继续

4. **呈现发现和设计选项**：
   ```
   Based on my research, here's what I found:

   **Current State:**
   - [Key discovery about existing code]
   - [Pattern or convention to follow]

   **Design Options:**
   1. [Option A] - [pros/cons]
   2. [Option B] - [pros/cons]

   **Open Questions:**
   - [Technical uncertainty]
   - [Design decision needed]

   Which approach aligns best with your vision?
   ```

### 第 3 步：计划结构开发

一旦就方法达成一致：

1. **创建初始计划大纲**：
   ```
   Here's my proposed plan structure:

   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]
   3. [Phase name] - [what it accomplishes]

   Does this phasing make sense? Should I adjust the order or granularity?
   ```

2. **在编写细节之前获得对结构的反馈**

### 第 4 步：详细计划编写

在结构批准后：

1. **将计划写入** `thoughts/shared/plans/YYYY-MM-DD-ENG-XXXX-description.md`
   - 格式：`YYYY-MM-DD-ENG-XXXX-description.md`，其中：
     - YYYY-MM-DD 是今天的日期
     - ENG-XXXX 是工单编号（无工单则省略）
     - description 是简短的 kebab-case 描述
   - 示例：
     - 有工单：`2025-01-08-ENG-1478-parent-child-tracking.md`
     - 无工单：`2025-01-08-improve-error-handling.md`
2. **使用此模板结构**：

````markdown
# [Feature/Task Name] Implementation Plan

## Overview

[Brief description of what we're implementing and why]

## Current State Analysis

[What exists now, what's missing, key constraints discovered]

## Desired End State

[A Specification of the desired end state after this plan is complete, and how to verify it]

### Key Discoveries:
- [Important finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach

[High-level strategy and reasoning]

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Changes**: [Summary of changes]

```[language]
// Specific code to add/modify
```

### Success Criteria:

#### Automated Verification:
- [ ] Migration applies cleanly: `make migrate`
- [ ] Unit tests pass: `make test-component`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `make lint`
- [ ] Integration tests pass: `make test-integration`

#### Manual Verification:
- [ ] Feature works as expected when tested via UI
- [ ] Performance is acceptable under load
- [ ] Edge case handling verified manually
- [ ] No regressions in related features

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: [Descriptive Name]

[Similar structure with both automated and manual success criteria...]

---

## Testing Strategy

### Unit Tests:
- [What to test]
- [Key edge cases]

### Integration Tests:
- [End-to-end scenarios]

### Manual Testing Steps:
1. [Specific step to verify feature]
2. [Another verification step]
3. [Edge case to test manually]

## Performance Considerations

[Any performance implications or optimizations needed]

## Migration Notes

[If applicable, how to handle existing data/systems]

## References

- Original ticket: `thoughts/allison/tickets/eng_XXXX.md`
- Related research: `thoughts/shared/research/[relevant].md`
- Similar implementation: `[file:line]`
````

### 第 5 步：同步与审查

1. **同步 thoughts 目录**：
   - 这确保计划被正确索引并可用

2. **呈现草稿计划位置**：
   ```
   I've created the initial implementation plan at:
   `thoughts/shared/plans/YYYY-MM-DD-ENG-XXXX-description.md`

   Please review it and let me know:
   - Are the phases properly scoped?
   - Are the success criteria specific enough?
   - Any technical details that need adjustment?
   - Missing edge cases or considerations?
   ```

3. **基于反馈迭代** —— 准备好：
   - 添加缺失的阶段
   - 调整技术方法
   - 澄清成功标准（自动化和手动）
   - 添加/移除范围项

4. **继续精炼**直到用户满意

## 重要指南

1. **保持怀疑**：
   - 质疑模糊的需求
   - 尽早识别潜在问题
   - 问"为什么"和"那……呢"
   - 不要假设——用代码验证

2. **保持互动**：
   - 不要一次写完整计划
   - 在每个主要步骤获得支持
   - 允许调整方向
   - 协作工作

3. **要彻底**：
   - 在规划前**完整**读取所有上下文文件
   - 使用并行子任务研究实际代码模式
   - 包含具体文件路径和行号
   - 编写带清晰自动化 vs 手动区分的可衡量成功标准

4. **要务实**：
   - 关注增量、可测试的更改
   - 考虑迁移和回滚
   - 思考边缘情况
   - 包含"我们**不**做什么"

5. **跟踪进展**：
   - 使用 TodoWrite 跟踪规划任务
   - 完成研究时更新待办
   - 完成时标记规划任务完成

6. **最终计划中无未决问题**：
   - 如果规划期间遇到未决问题，**停止**
   - 立即研究或请求澄清
   - **不要**写带未解决问题计划
   - 实施计划必须完整且可操作
   - 在定稿计划之前必须做出每个决策

## 成功标准指南

**始终将成功标准分为两类：**

1. **自动化验证**（可由执行代理运行）：
   - 可运行的命令：`make test`、`npm run lint` 等
   - 应存在的具体文件
   - 代码编译/类型检查
   - 自动化测试套件

2. **手动验证**（需要人工测试）：
   - UI/UX 功能
   - 真实条件下的性能
   - 难以自动化的边缘情况
   - 用户验收标准

**格式示例：**
```markdown
### Success Criteria:

#### Automated Verification:
- [ ] Database migration runs successfully: `make migrate`
- [ ] All unit tests pass: `go test ./...`
- [ ] No linting errors: `golangci-lint run`
- [ ] API endpoint returns 200: `curl localhost:8080/api/new-endpoint`

#### Manual Verification:
- [ ] New feature appears correctly in the UI
- [ ] Performance is acceptable with 1000+ items
- [ ] Error messages are user-friendly
- [ ] Feature works correctly on mobile devices
```

## 常见模式

### 对于数据库更改：
- 从 schema/迁移开始
- 添加存储方法
- 更新业务逻辑
- 通过 API 暴露
- 更新客户端

### 对于新功能：
- 先研究现有模式
- 从数据模型开始
- 构建后端逻辑
- 添加 API 端点
- 最后实现 UI

### 对于重构：
- 记录当前行为
- 规划增量更改
- 保持向后兼容性
- 包含迁移策略

## 子任务生成最佳实践

生成研究子任务时：

1. **并行生成多个任务**以提高效率
2. **每个任务应聚焦**于特定领域
3. **提供详细指令**，包括：
   - 确切搜索什么
   - 关注哪些目录
   - 提取什么信息
   - 预期输出格式
4. **对目录 EXTREMELY 具体**：
   - 在提示中包含完整路径上下文
5. **指定只读工具**使用
6. **在响应中请求具体 file:line 引用**
7. **等待所有任务完成**后再综合
8. **验证子任务结果**：
   - 如果子任务返回意外结果，生成后续任务
   - 对照实际代码库交叉检查发现
   - 不要接受看起来不正确的结果

生成多个任务的示例：
```python
# Spawn these tasks concurrently:
tasks = [
    Task("Research database schema", db_research_prompt),
    Task("Find API patterns", api_research_prompt),
    Task("Investigate UI components", ui_research_prompt),
    Task("Check test patterns", test_research_prompt)
]
```

## Example Interaction Flow

```
User: /implementation_plan
Assistant: I'll help you create a detailed implementation plan...

User: We need to add parent-child tracking for Claude sub-tasks. See thoughts/allison/tickets/eng_1478.md
Assistant: Let me read that ticket file completely first...

[Reads file fully]

Based on the ticket, I understand we need to track parent-child relationships for Claude sub-task events in the daemon. Before I start planning, I have some questions...

[Interactive process continues...]
```
