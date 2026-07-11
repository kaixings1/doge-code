---
type: prompt
name: gsd:complete-milestone
归档已完成里程碑并为下一迭代做准备。
argument-hint: <version>
allowed-tools:
  - Read
  - Write
  - Bash
requires: [audit-milestone, discuss-phase, execute-phase, new-milestone, phase, plan-phase, stats, update]
---

<objective>
标记里程碑 {{version}} 完成，归档到 milestones/，并更新 ROADMAP.md 和 REQUIREMENTS.md。

目的：创建已发布版本的历史记录，归档里程碑工件（路线图 + 需求），为下一个里程碑做准备。
输出：里程碑已归档（路线图 + 需求），PROJECT.md 已更新，git 已标记。
</objective>

<execution_context>
**立即加载以下文件（继续之前）：**

- @~/.claude/get-shit-done/workflows/complete-milestone.md（主工作流）
- @~/.claude/get-shit-done/templates/milestone-archive.md（归档模板）
  </execution_context>

<context>
**项目文件：**
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/PROJECT.md`

**用户输入：**

- 版本：{{version}}（例如 "1.0", "1.1", "2.0"）
  </context>

<process>

**遵循 complete-milestone.md 工作流：**

0. **检查审计：**

   - 查找 `.planning/v{{version}}-MILESTONE-AUDIT.md`
   - 如果缺失或过期：建议先运行 `/gsd:audit-milestone`
   - 如果审计状态为 `gaps_found`：建议内联关闭差距
     （审计输出已枚举它们——通过 `/gsd:phase --insert <N>` 插入关闭阶段
     加上标准 discuss/plan/execute 链）然后再继续。
   - 如果审计状态为 `passed`：继续到步骤 1

   ```markdown
   ## 预检检查

   {如果没有 v{{version}}-MILESTONE-AUDIT.md：}
   ⚠ 未找到里程碑审计。先运行 `/gsd:audit-milestone` 以验证
   需求覆盖、跨阶段集成和端到端流程。

   {如果审计有差距：}
   ⚠ 里程碑审计发现差距。审计输出已枚举未满足的
   需求、跨阶段问题和不完整流程——通过 `/gsd:phase --insert <N>` 为每个差距插入
   关闭阶段，并运行标准 `/gsd:discuss-phase` → `/gsd:plan-phase` → `/gsd:execute-phase`
   链。或者继续执行以将差距接受为技术债务。

   {如果审计通过：}
   ✓ 里程碑审计通过。正在继续完成。
   ```

1. **验证就绪状态：**

   - 检查里程碑中所有阶段都有完成的计划（SUMMARY.md 存在）
   - 展示里程碑范围和统计信息
   - 等待确认

2. **收集统计信息：**

   - 统计阶段、计划、任务数量
   - 计算 git 范围、文件更改、代码行数
   - 从 git 日志提取时间线
   - 展示摘要，确认

3. **提取成就：**

   - 读取里程碑范围内的所有阶段 SUMMARY.md 文件
   - 提取 4-6 个关键成就
   - 提交审批

4. **归档里程碑：**

   - 创建 `.planning/milestones/v{{version}}-ROADMAP.md`
   - 从 ROADMAP.md 提取完整的阶段详情
   - 填充 milestone-archive.md 模板
   - 将 ROADMAP.md 更新为一行摘要和链接

5. **归档需求：**

   - 创建 `.planning/milestones/v{{version}}-REQUIREMENTS.md`
   - 将所有 v1 需求标记为已完成（复选框已勾选）
   - 记录需求结果（已验证、已调整、已放弃）
   - 删除 `.planning/REQUIREMENTS.md`（为下一里程碑创建新的）

6. **更新 PROJECT.md：**

   - 添加带有已发布版本的"当前状态"部分
   - 添加"下一里程碑目标"部分
   - 在 `<details>` 中归档之前的内容（如果是 v1.1+）

7. **提交和标记：**

   - 暂存：MILESTONES.md、PROJECT.md、ROADMAP.md、STATE.md、归档文件
   - 提交：`chore: archive v{{version}} milestone`
   - 标记：`git tag -a v{{version}} -m "[milestone summary]"`
   - 询问是否推送标签

8. **提供后续步骤：**
   - `/gsd:new-milestone` — 开始下一里程碑（提问 → 研究 → 需求 → 路线图）

</process>

<success_criteria>

- 里程碑已归档到 `.planning/milestones/v{{version}}-ROADMAP.md`
- 需求已归档到 `.planning/milestones/v{{version}}-REQUIREMENTS.md`
- `.planning/REQUIREMENTS.md` 已删除（为下一里程碑创建新的）
- ROADMAP.md 折叠为一行条目
- PROJECT.md 已更新当前状态
- Git 标签 v{{version}} 已创建（如果 `git.create_tag` 已启用）
- 提交成功
- 用户了解后续步骤（包括需要新需求）
  </success_criteria>

<critical_rules>

- **首先加载工作流：** 在执行前读取 complete-milestone.md
- **验证完成情况：** 所有阶段必须具有 SUMMARY.md 文件
- **用户确认：** 在验证关卡等待批准
- **删除前先归档：** 始终在更新/删除原始文件之前创建归档文件
- **一行摘要：** ROADMAP.md 中的折叠里程碑应为带有链接的单行
- **上下文效率：** 归档使每个里程碑的 ROADMAP.md 和 REQUIREMENTS.md 大小保持恒定
- **新需求：** 下一里程碑从 `/gsd:new-milestone` 开始，其中包含需求定义
  </critical_rules>
