---
description: 创建新发布版本
---

创建新发布版本。遵循此工作流：

## 步骤 1：确定发布编号

通过 Azure DevOps MCP（`work_list_iterations`）检查项目中的现有迭代，查找遵循 `Release #N` 命名模式的迭代。新发布编号是下一个顺序编号。

如果提供了 `$ARGUMENTS`，将其用作发布名称（例如 `$ARGUMENTS` = "24" 创建 "Release #24"）。

## 步骤 2：收集发布的工作项

询问用户要包含哪些工作项。他们可以提供：
- 工作项 ID 列表（例如 "AB#1234, AB#1235, AB#1236"）
- 查询条件（例如 "当前迭代中所有已完成的用户故事"）
- 状态筛选条件（例如 "所有准备测试的项目"）

使用 Azure DevOps MCP 搜索/查询指定的工作项。展示列表供确认：

```
## 发布 #{N}

| ID | 类型 | 标题 | 状态 |
|----|------|-------|-------|
| AB#1234 | 用户故事 | 添加支付导出 | 准备测试 |
| AB#1235 | Bug | 修复登录重定向 | 准备测试 |
| AB#1236 | 用户故事 | 查看历史 | 准备测试 |

使用 {count} 个工作项创建此发布？（是/否）
```

等待确认后再继续。

## 步骤 3：创建发布迭代

通过 `work_create_iterations` 在 Azure DevOps 中创建新迭代：
- **名称**：`Release #{N}`
- **开始日期**：今天
- 无结束日期（部署到生产环境时设置）

## 步骤 4：将工作项分配给发布

使用 `wit_update_work_items_batch` 将每个工作项的迭代路径设置为新发布迭代：
- **path**：`/fields/System.IterationPath`
- **value**：`{project}\Release #{N}`

## 步骤 5：标记工作项

使用 `wit_update_work_items_batch` 向每个工作项添加发布标签：
- **path**：`/fields/System.Tags`
- **value**：将 `release-{N}` 附加到现有标签

## 步骤 6：确认

展示最终摘要：

```
发布 #{N} 已创建，包含 {count} 个工作项。

已分配的工作项：
- AB#1234: 添加支付导出
- AB#1235: 修复登录重定向
- AB#1236: 查看历史

将此发布部署到 staging：  /deploy-release {N} staging
将此发布部署到 production：/deploy-release {N} production
```
