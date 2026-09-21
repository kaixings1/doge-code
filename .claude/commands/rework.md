---
description: 根据上次拉取请求的反馈重新处理工作项
---

基于上次拉取请求后收到的反馈，重新处理工作项 AB#$ARGUMENTS。遵循此工作流：

## 第 1 步：找到最新的拉取请求

将 `$ARGUMENTS` 作为 `1234` 或 `AB#1234` 处理——调用 MCP API 时剥离 `AB#` 前缀。

找到链接到此工作项的最新的 PR：

1. 通过 MCP 读取工作项并记录其**关系** —— 查找拉取请求产物链接
2. 对每个链接的 PR，通过 `repo_get_pull_request_by_id` 获取其详情并记录 **creationDate**
3. 按创建日期识别**最新的 PR** —— 这是检测新反馈的基线

将 PR 的 `creationDate` 保存为 `LAST_PR_DATE` —— 此时间戳之后的都是新反馈。

## 第 2 步：收集返工反馈

### 新评论

通过 `wit_list_work_item_comments` 读取工作项评论。仅过滤出在 `LAST_PR_DATE` **之后**创建的评论。这些包含返工反馈。

对每条新评论，检查嵌入的图像（`<img>` 标签，`src` URL 指向 Azure DevOps 附件）。使用 WebFetch **下载并查看每个嵌入图像** —— 它们通常包含 bug 截图、视觉问题或标注的 UI，显示需要更改什么。

### 描述与验收标准更改

通过 `wit_list_work_item_revisions` 读取工作项修订。检查**描述**或**验收标准**字段是否在 `LAST_PR_DATE` **之后**被修改。

- 如果更改：提取**当前**描述和验收标准，并记录添加或修改了什么
- 如果未更改：仍然读取当前描述和验收标准——评论可能引用了原始需求中但实现中缺失的东西

### 始终重新阅读需求

无论描述/验收标准是否更改，**始终读取完整的当前描述和验收标准**。返工评论常说"X 的原始需求缺失"而描述本身没有更改。你需要完整上下文来理解反馈指的是什么。

## 第 3 步：总结返工并确认

向用户呈现返工反馈的摘要：

```
## Rework for AB#{id}: {title}

**Last PR:** #{pr_id} (created {date})
**New comments:** {count}

### Rework Feedback
{summarized feedback from new comments — numbered list}

### Requirement Changes (if any)
{description/acceptance criteria changes since last PR, or "No changes to description or acceptance criteria since last PR"}

### Current Acceptance Criteria
{full acceptance criteria — numbered list, highlight any that the feedback suggests are not yet met}

Does this capture the rework correctly? Do you have any additional context?
```

**等待用户响应。** 在用户确认或提供额外上下文之前，**不要**继续。如果他们添加上下文，将其纳入计划。

## 第 4 步：探索与规划

1. **探索**代码库以映射相关文件——关注上一个 PR 中更改的文件以及需要的任何新区域
2. **规划**返工方法

向用户呈现计划：

```
## Rework Plan for AB#{id}

### Approach
{brief description of what needs to change to address the feedback}

### Files to Create
- `path/to/new/file.cs` — {purpose}
- `path/to/new/file.tsx` — {purpose}

### Files to Modify
- `path/to/existing/file.cs` — {what changes and why}
- `path/to/existing/file.tsx` — {what changes and why}

### Files to Delete (if any)
- `path/to/old/file.cs` — {why it's being removed}

### Agents
- **backend**: {what it will do}
- **frontend**: {what it will do}

### Risks / Considerations
- {any potential issues or trade-offs}

Approve this plan? (yes / no / suggest changes)
```

**等待用户批准计划。** 在用户批准之前**不要**开始实现。如果他们建议更改，修订计划并再次呈现。

## 第 5 步：切换到现有分支

工作项已有一个来自上一个 PR 的分支。切换到它：

1. 从最新 PR 获取源分支名
2. 切换到该分支：`git checkout <branch-name>`
3. 拉取最新：`git pull`

如果 PR 已完成/合并且分支被删除，则从 PR 的目标分支创建一个新分支，遵循与 `/implement` 第 4 步相同的命名约定。

## 第 6 步：实现

1. 根据已批准的计划，使用后端和/或前端代理**实现**返工
2. 如果有 UI 更改则**生成样稿**

## 第 7 步：构建验证

在任何其他质量检查**之前**运行构建检查。使用 `build-validator` 代理验证所有项目成功编译。

- 如果构建失败，**立即修复错误**并重新运行直到构建通过
- 在构建干净之前**不要**继续审查、测试或 lint

## 第 8 步：质量检查

1. **审查**代码的质量、安全性和 Clean Architecture 合规性
2. **运行测试** —— 单元、集成和构建验证
3. **运行 lint** —— ESLint 和 dotnet format

## 第 9 步：UAT 门禁

### 如果是热修复：
跳过手动 UAT。呈现简化的确认：

```
Rework complete. All automated checks passed.

Push changes? (yes/no)
```

在继续之前等待确认。

### 如果是功能、用户故事、Bug 或其他：
从验收标准生成 UAT 检查清单并呈现：

```
Automated checks passed and the UAT checklist is ready.

## UAT Checklist
[generated checklist here — highlight items specific to the rework feedback]

Please manually test the rework using the checklist above.

Did manual testing pass?
- If YES → reply "testing passed" and I will push the changes
- If NO  → describe what failed or what behaved unexpectedly
           and I will investigate and fix before asking you again
```

在继续之前等待用户的响应。在确认之前**不要**推送。

## 第 10 步：推送并更新

1. 推送更改：`git push`
2. 在现有 PR 上添加评论，总结返工中更改了什么
3. 如需要在 Azure DevOps 中更新工作项状态
