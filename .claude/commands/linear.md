---
description: 管理 Linear 工单 — 创建、更新、评论、遵循工作流模式
---

# Linear - 工单管理

你的任务是管理 Linear 工单，包括从 thoughts 文档创建工单、更新现有工单以及遵循团队的特定工作流模式。

## 初始设置

首先，通过检查是否存在任何 `mcp__linear__` 工具来验证 Linear MCP 工具是否可用。如果不可用，回复：
```
我需要访问 Linear 工具才能协助工单管理。请运行 `/mcp` 命令启用 Linear MCP 服务器，然后重试。
```

如果工具可用，根据用户请求回复：

### 对于一般请求：
```
我可以协助你处理 Linear 工单。你想做什么？
1. 从 thoughts 文档创建新工单
2. 为工单添加评论（我会使用我们的对话上下文）
3. 搜索工单
4. 更新工单状态或详情
```

### 对于具体的创建请求：
```
我会帮你从 thoughts 文档创建 Linear 工单。请提供：
1. thoughts 文档的路径（或要搜索的主题）
2. 工单的任何特定关注点或角度（可选）
```

然后等待用户输入。

## 团队工作流与状态推进

团队遵循特定工作流，以确保在代码实现前达成一致：

1. **Triage** → 所有新工单从这里开始初始审查
2. **Spec Needed** → 需要更多细节 —— 必须明确要解决的问题和方案概要
3. **Research Needed** → 工单在编写计划前需要调查
4. **Research in Progress** → 正在积极研究/调查中
5. **Research in Review** → 研究发现正在审查中（可选步骤）
6. **Ready for Plan** → 研究完成，工单需要一份实现计划
7. **Plan in Progress** → 正在积极编写实现计划
8. **Plan in Review** → 计划已写好，正在讨论中
9. **Ready for Dev** → 计划已批准，可以开始实现
10. **In Dev** → 正在积极开发
11. **Code Review** → 已提交 PR
12. **Done** → 已完成

**关键原则**：审查和对齐发生在计划阶段（而非 PR 阶段），以便更快推进并避免返工。

## 重要约定

### Thoughts 文档的 URL 映射
引用 thoughts 文档时，始终通过 `links` 参数提供 GitHub 链接：
- `thoughts/shared/...` → `https://github.com/humanlayer/thoughts/blob/main/repos/humanlayer/shared/...`
- `thoughts/allison/...` → `https://github.com/humanlayer/thoughts/blob/main/repos/humanlayer/allison/...`
- `thoughts/global/...` → `https://github.com/humanlayer/thoughts/blob/main/global/...`

### 默认值
- **状态**：始终以 "Triage" 状态创建新工单
- **项目**：对于新工单，除非另有说明，默认为 "M U L T I C L A U D E"（ID: f11c8d63-9120-4393-bfae-553da0b04fd8）
- **优先级**：大多数任务默认为 Medium (3)，运用最佳判断或询问用户
  - Urgent (1)：关键阻塞项、安全问题
  - High (2)：有截止日期的重要功能、重大 bug
  - Medium (3)：标准实现任务（默认）
  - Low (4)：锦上添花、次要改进
- **链接**：使用 `links` 参数附加 URL（而不仅仅是描述中的 markdown 链接）

### 自动标签分配
根据工单内容自动应用标签：
- **hld**：针对关于 `hld/` 目录（守护进程）的工单
- **wui**：针对关于 `humanlayer-wui/` 的工单
- **meta**：针对关于 `hlyr` 命令、thoughts 工具或 `thoughts/` 目录的工单

注意：meta 与 hld/wui 互斥。工单可以同时有 hld 和 wui，但不能有 meta 加其中任何一个。

## 动作专属说明

### 1. 从 Thoughts 创建工单

#### 收到请求后要遵循的步骤：

1. **定位并阅读 thoughts 文档：**
   - 如果给出了路径，直接阅读该文档
   - 如果给出了主题/关键词，用 Grep 搜索 thoughts/ 目录以找到相关文档
   - 如果找到多个匹配项，显示列表并让用户选择
   - 创建一个 TodoWrite 列表来跟踪：阅读文档 → 分析内容 → 起草工单 → 获取用户输入 → 创建工单

2. **分析文档内容：**
   - 识别所讨论的核心问题或功能
   - 提取关键实现细节或技术决策
   - 记录提及的任何特定代码文件或区域
   - 查找行动项或下一步
   - 识别这个想法处于哪个阶段（早期构思 vs 可以开始实现）
   - 花时间深入思考，把这份文档的精髓提炼为清晰的问题陈述和解决方案思路

3. **检查相关上下文（如果文档中提及）：**
   - 如果文档引用了特定代码文件，阅读相关章节
   - 如果它提及了其他 thoughts 文档，快速查看它们
   - 查找提及的任何现有 Linear 工单

4. **获取 Linear 工作区上下文：**
   - 列出团队：`mcp__linear__list_teams`
   - 如果有多个团队，让用户选择一个
   - 列出所选团队的项目：`mcp__linear__list_projects`

5. **起草工单摘要：**
   向用户呈现草稿：
   ```
   ## Draft Linear Ticket

   **Title**: [清晰、面向行动的标题]

   **Description**:
   [对问题/目标的 2-3 句话总结]

   ## Key Details
   - [来自 thoughts 的重要细节要点]
   - [技术决策或约束]
   - [任何特定要求]

   ## Implementation Notes (if applicable)
   [概述的任何特定技术思路或步骤]

   ## References
   - Source: `thoughts/[path/to/document.md]` ([View on GitHub](converted GitHub URL))
   - Related code: [any file:line references]
   - Parent ticket: [if applicable]

   ---
   根据文档，这看起来处于以下阶段：[ideation/planning/ready to implement]
   ```

6. **交互式细化：**
   询问用户：
   - 这份摘要是否准确反映了工单？
   - 这个应该放在哪个项目？[显示列表]
   - 什么优先级？（默认：Medium/3）
   - 有没有要补充的额外上下文？
   - 我们应该包含更多还是更少的实现细节？
   - 你想把它指派给自己吗？

   注意：工单默认将以 "Triage" 状态创建。

7. **创建 Linear 工单：**
   ```
   mcp__linear__create_issue with:
   - title: [refined title]
   - description: [final description in markdown]
   - teamId: [selected team]
   - projectId: [use default project from above unless user specifies]
   - priority: [selected priority number, default 3]
   - stateId: [Triage status ID]
   - assigneeId: [if requested]
   - labelIds: [apply automatic label assignment from above]
   - links: [{url: "GitHub URL", title: "Document Title"}]
   ```

8. **创建后动作：**
   - 显示已创建的工单 URL
   - 询问用户是否想要：
     - 添加包含额外实现细节的评论
     - 为具体行动项创建子任务
     - 用工单引用更新原始 thoughts 文档
   - 如果同意更新 thoughts 文档：
     ```
     在文档顶部添加：
     ---
     linear_ticket: [URL]
     created: [date]
     ---
     ```

## 转换示例：

### 从冗长的 thoughts：
```
"我一直在想，我们恢复的会话没有正确继承权限。
这导致用户不得不重新指定所有内容。我们也许应该
把所有配置存到数据库里，恢复时再拉出来。也许我们需要
为 permission_prompt_tool 和 allowed_tools 增加新列……"
```

### 转为简洁的工单：
```
标题：修复恢复的会话以从父会话继承所有配置

描述：

## 要解决的问题
目前，恢复的会话只从父会话继承 Model 和 WorkingDir，
导致所有其他配置丢失。用户在恢复时必须重新指定权限和设置。

## 解决方案
把所有会话配置存储在数据库中，并在恢复会话时自动继承，
同时支持显式覆盖。
```

### 2. 为现有工单添加评论和链接

当用户想要为工单添加评论时：

1. **确定是哪个工单：**
   - 使用当前对话的上下文来识别相关工单
   - 如果不确定，用 `mcp__linear__get_issue` 显示工单详情并与用户确认
   - 在近期讨论的工作中查找工单引用

2. **为清晰起见格式化评论：**
   - 尽量保持评论简洁（约 10 行），除非需要更多细节
   - 聚焦于关键洞见或对人类读者最有用的信息
   - 不只是做了什么，而是其中重要的地方
   - 包含带反引号和 GitHub 链接的相关文件引用

3. **文件引用格式：**
   - 用反引号包裹路径：`thoughts/allison/example.md`
   - 在后面添加 GitHub 链接：`([View](url))`
   - 对提及的 thoughts/ 和代码文件都这样做

4. **评论结构示例：**
   ```markdown
   在 webhook 处理器中实现了重试逻辑，以解决限流问题。

   关键洞见：429 响应集中在批量操作期间，
   所以仅靠指数退避不够 —— 增加了请求排队。

   更新的文件：
   - `hld/webhooks/handler.go` ([GitHub](link))
   - `thoughts/shared/rate_limit_analysis.md` ([GitHub](link))
   ```

5. **正确处理链接：**
   - 如果随评论添加链接：用链接更新 issue，并在评论中提及
   - 如果只添加链接：仍然创建一条评论，说明添加了什么链接以备查
   - 始终通过 `links` 参数把链接添加到 issue 本身

6. **对于带链接的评论：**
   ```
   # First, update the issue with the link
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - links: [existing links + new link with proper title]

   # Then, create the comment mentioning the link
   mcp__linear__create_comment with:
   - issueId: [ticket ID]
   - body: [formatted comment with key insights and file references]
   ```

7. **对于仅添加链接：**
   ```
   # Update the issue with the link
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - links: [existing links + new link with proper title]

   # Add a brief comment for posterity
   mcp__linear__create_comment with:
   - issueId: [ticket ID]
   - body: "Added link: `path/to/document.md` ([View](url))"
   ```

### 3. 搜索工单

当用户想要查找工单时：

1. **收集搜索条件：**
   - 查询文本
   - 团队/项目筛选
   - 状态筛选
   - 日期范围（createdAt、updatedAt）

2. **执行搜索：**
   ```
   mcp__linear__list_issues with:
   - query: [search text]
   - teamId: [if specified]
   - projectId: [if specified]
   - stateId: [if filtering by status]
   - limit: 20
   ```

3. **呈现结果：**
   - 显示工单 ID、标题、状态、负责人
   - 如果有多个项目，按项目分组
   - 包含指向 Linear 的直接链接

### 4. 更新工单状态

当在工作流中推进工单时：

1. **获取当前状态：**
   - 拉取工单详情
   - 显示工作流中的当前状态

2. **建议下一个状态：**
   - Triage → Spec Needed（缺少细节/问题陈述）
   - Spec Needed → Research Needed（一旦概述了问题/方案）
   - Research Needed → Research in Progress（开始研究）
   - Research in Progress → Research in Review（可选，可跳到 Ready for Plan）
   - Research in Review → Ready for Plan（研究已批准）
   - Ready for Plan → Plan in Progress（开始编写计划）
   - Plan in Progress → Plan in Review（计划已写好）
   - Plan in Review → Ready for Dev（计划已批准）
   - Ready for Dev → In Dev（工作已开始）

3. **带上下文更新：**
   ```
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - stateId: [new status ID]
   ```

   考虑添加一条解释状态变更的评论。

## 重要说明

- 在描述和评论中使用 `@[name](ID)` 格式标记用户，例如 `@[dex](16765c85-2286-4c0f-ab49-0d4d79222ef5)`
- 保持工单简洁但完整 —— 目标是内容易于扫读
- 所有工单都应包含清晰的"要解决的问题" —— 如果用户要求一个工单却只给了实现细节，你**必须**问："为了写出好的工单，请从用户角度解释你试图解决的问题"
- 聚焦于"是什么"和"为什么"，只有当"怎么做"定义明确时才包含它
- 始终通过 `links` 参数保留指向源材料的链接
- 除非被要求，否则不要从早期阶段的头脑风暴创建工单
- 使用恰当的 Linear markdown 格式
- 以如下形式包含代码引用：`path/to/file.ext:linenum`
- 宁可请求澄清，也不要猜测项目/状态
- 记住 Linear 描述支持完整 markdown，包括代码块
- 始终对外部 URL 使用 `links` 参数（而不仅仅是 markdown 链接）
- 记住 —— 你必须拿到"要解决的问题"！

## 评论质量指南

创建评论时，聚焦于为人类读者提取**最有价值的信息**：

- **关键洞见优先于总结**：什么是"啊哈"时刻或关键理解？
- **决策与取舍**：选择了什么方案，它促成/阻止了什么
- **已解决的阻塞项**：什么阻碍了进展，如何解决的
- **状态变化**：现在有什么不同，对下一步意味着什么
- **意外或发现**：影响工作的意外发现

避免：
- 没有上下文的机械式变更列表
- 重述代码 diff 中显而易见的内容
- 不增加价值的泛泛总结

记住：目标是帮助未来的读者（包括你自己）快速理解这次更新中重要的部分。

## 常用 ID

### 工程团队
- **Team ID**: `6b3b2115-efd4-4b83-8463-8160842d2c84`

### 标签 ID
- **bug**: `ff23dde3-199b-421e-904c-4b9f9b3d452c`
- **hld**: `d28453c8-e53e-4a06-bea9-b5bbfad5f88a`
- **meta**: `7a5abaae-f343-4f52-98b0-7987048b0cfa`
- **wui**: `996deb94-ba0f-4375-8b01-913e81477c4b`

### 工作流状态 ID
- **Triage**: `77da144d-fe13-4c3a-a53a-cfebd06c0cbe` (type: triage)
- **spec needed**: `274beb99-bff8-4d7b-85cf-04d18affbc82` (type: unstarted)
- **research needed**: `d0b89672-8189-45d6-b705-50afd6c94a91` (type: unstarted)
- **research in progress**: `c41c5a23-ce25-471f-b70a-eff1dca60ffd` (type: unstarted)
- **research in review**: `1a9363a7-3fae-42ee-a6c8-1fc714656f09` (type: unstarted)
- **ready for plan**: `995011dd-3e36-46e5-b776-5a4628d06cc8` (type: unstarted)
- **plan in progress**: `a52b4793-d1b6-4e5d-be79-b2254185eed0` (type: started)
- **plan in review**: `15f56065-41ea-4d9a-ab8c-ec8e1a811a7a` (type: started)
- **ready for dev**: `c25bae2f-856a-4718-aaa8-b469b7822f58` (type: started)
- **in dev**: `6be18699-18d7-496e-a7c9-37d2ddefe612` (type: started)
- **code review**: `8ca7fda1-08d4-48fb-a0cf-954246ccbe66` (type: started)
- **Ready for Deploy**: `a3ad0b54-17bf-4ad3-b1c1-2f56c1f2515a` (type: started)
- **Done**: `8159f431-fbc7-495f-a861-1ba12040f672` (type: completed)
- **Backlog**: `6cf6b25a-054a-469b-9845-9bd9ab39ad76` (type: backlog)
- **PostIts**: `a57f2ab3-c6f8-44c7-a36b-896154729338` (type: backlog)
- **Todo**: `ddf85246-3a7c-4141-a377-09069812bbc3` (type: unstarted)
- **Duplicate**: `2bc0e829-9853-4f76-ad34-e8732f062da2` (type: canceled)
- **Canceled**: `14a28d0d-c6aa-4d8e-9ff2-9801d4cc7de1` (type: canceled)


## Linear User IDs

- allison: b157f9e4-8faf-4e7e-a598-dae6dec8a584
- dex: 16765c85-2286-4c0f-ab49-0d4d79222ef5
- sundeep: 0062104d-9351-44f5-b64c-d0b59acb516b
