---
description: 生成遵循仓库模板的完整 PR 描述
---

# 生成 PR 描述

你的任务是按照仓库的标准模板生成全面的拉取请求描述。

## 遵循的步骤：

1. **读取 PR 描述模板：**
   - 首先检查 `thoughts/shared/pr_description.md` 是否存在
   - 如果不存在，告知用户他们的 `humanlayer thoughts` 设置不完整，需要在 `thoughts/shared/pr_description.md` 创建 PR 描述模板
   - 仔细阅读模板，了解所有章节和要求

2. **确定要描述的 PR：**
   - 检查当前分支是否有关联的 PR：`gh pr view --json url,number,title,state 2>/dev/null`
   - 如果当前分支没有 PR，或在 main/master 上，列出开放的 PR：`gh pr list --limit 10 --json number,title,headRefName,author`
   - 询问用户想要描述哪个 PR

3. **检查现有描述：**
   - 检查 `thoughts/shared/prs/{number}_description.md` 是否已存在
   - 如果存在，读取它并告知用户你将更新它
   - 考虑自上次描述编写以来发生了什么变化

4. **收集全面的 PR 信息：**
   - 获取完整的 PR diff：`gh pr diff {number}`
   - 如果收到关于无默认远程仓库的错误，指示用户运行 `gh repo set-default` 并选择适当的仓库
   - 获取提交历史：`gh pr view {number} --json commits`
   - 审查基础分支：`gh pr view {number} --json baseRefName`
   - 获取 PR 元数据：`gh pr view {number} --json url,title,number,state`

5. **彻底分析更改：**（深度思考代码更改、其架构含义和潜在影响）
   - 仔细通读整个 diff
   - 对于上下文，读取 diff 中引用但未显示的任何文件
   - 理解每个更改的目的和影响
   - 识别面向用户的更改与内部实现细节
   - 查找破坏性变更或迁移要求

6. **处理验证要求：**
   - 查看模板的"如何验证"部分中的任何检查项
   - 对于每个验证步骤：
     - 如果是你可以运行的命令（如 `make check test`、`npm test` 等），运行它
     - 如果通过，将复选框标记为已勾选：`- [x]`
     - 如果失败，保持未勾选并注明失败原因：`- [ ]` 并附上说明
     - 如果需要手动测试（UI 交互、外部服务），保持未勾选并告知用户
   - 记录你无法完成的任何验证步骤

7. **生成描述：**
   - 根据模板全面填写每个章节：
     - 基于你的分析回答每个问题/章节
     - 具体说明所解决的问题和所做的更改
     - 在相关时关注用户影响
     - 在适当章节包含技术细节
     - 编写简洁的变更日志条目
   - 确保所有检查项都已处理（已勾选或已解释）

8. **保存并同步描述：**
   - 将完成的描述写入 `thoughts/shared/prs/{number}_description.md`
   - 运行 `humanlayer thoughts sync` 同步 thoughts 目录
   - 向用户展示生成的描述

9. **更新 PR：**
   - 直接更新 PR 描述：`gh pr edit {number} --body-file thoughts/shared/prs/{number}_description.md`
   - 确认更新成功
   - 如果仍有未勾选的验证步骤，提醒用户在合并前完成它们

## 重要说明：
- 此命令适用于不同的仓库——始终读取本地模板
- 要彻底但简洁——描述应易于浏览
- 关注"为什么"与关注"是什么"同样重要
- 突出显示任何破坏性变更或迁移说明
- 如果 PR 涉及多个组件，相应地组织描述
- 尽可能尝试运行验证命令
- 清晰说明哪些验证步骤需要手动测试
