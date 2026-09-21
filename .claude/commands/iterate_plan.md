---
description: 通过充分研究和更新迭代现有实施计划
model: opus
---

# 迭代实施计划

你的任务是根据用户反馈更新现有的实施计划。你应该保持怀疑态度、全面考虑，并确保更改基于实际的代码库现状。

## 初始响应

当此命令被调用时：

1. **解析输入以识别**：
   - 计划文件路径（例如 `thoughts/shared/plans/2025-10-16-feature.md`）
   - 请求的更改/反馈

2. **处理不同的输入场景**：

   **如果未提供计划文件**：
   ```
   I'll help you iterate on an existing implementation plan.

   Which plan would you like to update? Please provide the path to the plan file (e.g., `thoughts/shared/plans/2025-10-16-feature.md`).

   Tip: You can list recent plans with `ls -lt thoughts/shared/plans/ | head`
   ```
   等待用户输入，然后重新检查反馈。

   **如果提供了计划文件但无反馈**：
   ```
   I've found the plan at [path]. What changes would you like to make?

   For example:
   - "Add a phase for migration handling"
   - "Update the success criteria to include performance tests"
   - "Adjust the scope to exclude feature X"
   - "Split Phase 2 into two separate phases"
   ```
   等待用户输入。

   **如果同时提供了计划文件和反馈**：
   - 立即进入第 1 步
   - 无需预备问题

## 过程步骤

### 第 1 步：读取并理解当前计划

1. **完整读取现有计划文件**：
   - 使用 Read 工具时**不带** limit/offset 参数
   - 理解当前结构、阶段和范围
   - 记录成功标准和实现方法

2. **理解请求的更改**：
   - 解析用户想要添加/修改/删除什么
   - 识别更改是否需要代码库研究
   - 确定更新的范围

### 第 2 步：如需要则研究

**仅当更改需要新的技术理解时才生成研究任务。**

如果用户的反馈需要理解新的代码模式或验证假设：

1. **创建研究待办列表**使用 TodoWrite

2. **生成并行子任务进行研究**：
   为每种研究类型使用正确的代理：

   **用于代码调查：**
   - **codebase-locator** —— 查找相关文件
   - **codebase-analyzer** —— 理解实现细节
   - **codebase-pattern-finder** —— 查找类似模式

   **用于历史上下文：**
   - **thoughts-locator** —— 查找相关研究或决策
   - **thoughts-analyzer** —— 从文档中提取洞见

   **对目录 EXTREMELY 具体**：
   - 如果更改涉及"WUI"，指定 `humanlayer-wui/` 目录
   - 如果涉及"daemon"，指定 `hld/` 目录
   - 在提示中包含完整路径上下文

3. **读取研究识别的任何新文件**：
   - 将它们完整读入主上下文
   - 与计划需求交叉引用

4. **等待所有子任务完成**后再继续

### 第 3 步：呈现理解和方案

在做出更改之前，确认你的理解：

```
Based on your feedback, I understand you want to:
- [Change 1 with specific detail]
- [Change 2 with specific detail]

My research found:
- [Relevant code pattern or constraint]
- [Important discovery that affects the change]

I plan to update the plan by:
1. [Specific modification to make]
2. [Another modification]

Does this align with your intent?
```

在继续之前获得用户确认。

### 第 4 步：更新计划

1. **对现有计划进行聚焦、精确的编辑**：
   - 使用 Edit 工具进行外科手术式更改
   - 保持现有结构，除非明确更改它
   - 保持所有 file:line 引用准确
   - 如需要则更新成功标准

2. **确保一致性**：
   - 如果添加新阶段，确保它遵循现有模式
   - 如果修改范围，更新"我们**不**做什么"章节
   - 如果更改方法，更新"实现方法"章节
   - 保持自动化 vs 手动成功标准的区分

3. **保持质量标准**：
   - 为新内容包含具体文件路径和行号
   - 编写可衡量的成功标准
   - 对自动化验证使用 `make` 命令
   - 保持语言清晰且可操作

### 第 5 步：同步与审查

1. **同步更新后的计划**：
   - 运行 `humanlayer thoughts sync`
   - 这确保更改被正确索引

2. **呈现所做的更改**：
   ```
   I've updated the plan at `thoughts/shared/plans/[filename].md`

   Changes made:
   - [Specific change 1]
   - [Specific change 2]

   The updated plan now:
   - [Key improvement]
   - [Another improvement]

   Would you like any further adjustments?
   ```

3. **准备好基于反馈进一步迭代**

## 重要指南

1. **保持怀疑**：
   - 不要盲目接受看起来有问题的更改请求
   - 质疑模糊的反馈——要求澄清
   - 通过代码研究验证技术可行性
   - 指出与现有计划阶段的潜在冲突

2. **要外科手术式**：
   - 进行精确编辑，而非整体重写
   - 保留不需要更改的好内容
   - 只研究特定更改所需的内容
   - 不要过度设计更新

3. **要彻底**：
   - 在做出更改前读取整个现有计划
   - 如果更改需要新的技术理解则研究代码模式
   - 确保更新后的章节保持质量标准
   - 验证成功标准仍可衡量

4. **保持互动**：
   - 在做出更改前确认理解
   - 在做之前展示你计划更改什么
   - 允许调整方向
   - 不要消失在研究中而不沟通

5. **跟踪进展**：
   - 如果复杂则使用 TodoWrite 跟踪更新任务
   - 完成研究时更新待办
   - 完成时标记任务完成

6. **无未决问题**：
   - 如果请求的更改引发问题，**询问**
   - 立即研究或获取澄清
   - **不要**用未解决问题更新计划
   - 每个更改必须完整且可操作

## 成功标准指南

更新成功标准时，始终维持两类结构：

1. **自动化验证**（可由执行代理运行）：
   - 可运行的命令：`make test`、`npm run lint` 等
   - 优先使用 `make` 命令：用 `make -C humanlayer-wui check` 而非 `cd humanlayer-wui && bun run fmt`
   - 应存在的具体文件
   - 代码编译/类型检查

2. **手动验证**（需要人工测试）：
   - UI/UX 功能
   - 真实条件下的性能
   - 难以自动化的边缘情况
   - 用户验收标准

## 子任务生成最佳实践

生成研究子任务时：

1. **仅当确实需要时才生成** —— 不要为简单更改做研究
2. **并行生成多个任务**以提高效率
3. **每个任务应聚焦**于特定领域
4. **提供详细指令**，包括：
   - 确切搜索什么
   - 关注哪些目录
   - 提取什么信息
   - 预期输出格式
5. **在响应中请求具体 file:line 引用**
6. **等待所有任务完成**后再综合
7. **验证子任务结果** —— 如果有问题，生成后续任务

## 示例交互流程

**场景 1：用户提前提供一切**
```
User: /iterate_plan thoughts/shared/plans/2025-10-16-feature.md - add phase for error handling
Assistant: [Reads plan, researches error handling patterns, updates plan]
```

**场景 2：用户只提供计划文件**
```
User: /iterate_plan thoughts/shared/plans/2025-10-16-feature.md
Assistant: I've found the plan. What changes would you like to make?
User: Split Phase 2 into two phases - one for backend, one for frontend
Assistant: [Proceeds with update]
```

**场景 3：用户不提供参数**
```
User: /iterate_plan
Assistant: Which plan would you like to update? Please provide the path...
User: thoughts/shared/plans/2025-10-16-feature.md
Assistant: I've found the plan. What changes would you like to make?
User: Add more specific success criteria
Assistant: [Proceeds with update]
```
