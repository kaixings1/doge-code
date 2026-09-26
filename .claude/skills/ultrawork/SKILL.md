---
name: ultrawork
description: 面向高吞吐任务完成的并行执行引擎。
argument-hint: "<task description with parallel work items>"
level: 4
---

<Purpose>
Ultrawork 是面向独立工作的并行执行引擎与执行协议。它强调意图落地、并行上下文收集、面向非平凡工作的依赖感知任务图，以及简洁的有证据支撑的执行摘要。它是一个**组件**，而非独立的持久化模式 —— 它提供并行能力和路由指引，但不提供持久化、验证循环或长期状态管理。
</Purpose>

<Use_When>
- 多个相互独立的任务可同时运行
- 用户说 "ulw"、"ultrawork"，或想要并行执行
- 你需要一次性把工作委派给多个代理
- 任务受益于并发执行，但用户将自行管理完成
</Use_When>

<Do_Not_Use_When>
- 任务需要带验证的保证完成 —— 改用 `ralph`（ralph 包含 ultrawork）
- 任务需要完整的自主流水线 —— 改用 `autopilot`（autopilot 包含 ralph，ralph 包含 ultrawork）
- 只有一个顺序任务、无并行机会 —— 直接委派给 executor 代理
- 用户需要会话持久化以便恢复 —— 使用 `ralph`，它在 ultrawork 之上增加了持久化
</Do_Not_Use_When>

<Why_This_Exists>
当任务相互独立时，顺序执行会浪费时间。Ultrawork 支持同时发射多个代理，并把每个路由到合适的模型等级，在控制 token 成本的同时减少总执行时间。它被设计为一个可组合的组件，由 ralph 和 autopilot 在其之上分层使用。
</Why_This_Exists>

<Execution_Policy>
- **同时**发射所有独立的代理调用 —— 绝不把独立工作串行化
- 委派时始终显式传递 `model` 参数
- 首次委派前先读 `docs/shared/agent-tiers.md` 获取代理选择指引
- 对超过约 30 秒的操作（安装、构建、测试）使用 `run_in_background: true`
- 快速命令（git status、文件读取、简单检查）在前台运行
- 在实现之前先厘清意图与不确定性；先探索，仅在仍然受阻时才提问
- 对非平凡任务，在执行前产出带并行波次的依赖感知计划
- 保持委派任务报告简洁：简短摘要、涉及文件、验证状态、阻塞项
- 对已实现的行为需要人工 QA，而不仅是诊断
</Execution_Policy>

<Steps>
1. **阅读代理参考**：加载 `docs/shared/agent-tiers.md` 以选择等级
2. **先落地意图**：确认请求属于实现、调查、评估还是研究；在厘清之前不要写代码
3. **并行收集上下文**：
   - 用直接工具做快速读取/搜索
   - 用探索/文档代理获取广泛上下文
4. **按独立性分类任务**：识别哪些任务可并行、哪些有依赖
5. **为非平凡工作创建任务图**：
   - 并行执行波次
   - 依赖矩阵
   - 每个任务的验收标准与验证步骤
6. **路由到正确的等级**：
   - 简单查找/定义：LOW 等级（Haiku）
   - 标准实现：MEDIUM 等级（Sonnet）
   - 复杂分析/重构：HIGH 等级（Opus）
7. **同时发射独立任务**：一次性启动所有可并行的任务
8. **顺序运行依赖任务**：在启动依赖工作之前等待前置条件
9. **长操作放后台**：构建、安装和测试套件使用 `run_in_background: true`
10. **所有任务完成后验证**（轻量）：
   - 构建/类型检查通过
   - 受影响的测试通过
   - 已实现行为完成了人工 QA
   - 未引入新错误
</Steps>

<Tool_Usage>
- 简单改动使用 `Task(subagent_type="oh-my-claudecode:executor", model="haiku", ...)`
- 标准工作使用 `Task(subagent_type="oh-my-claudecode:executor", model="sonnet", ...)`
- 复杂工作使用 `Task(subagent_type="oh-my-claudecode:executor", model="opus", ...)`
- 包安装、构建和测试套件使用 `run_in_background: true`
- 快速状态检查和文件操作使用前台执行
</Tool_Usage>

<Examples>
<Good>
三个独立任务同时发射：
```
Task(subagent_type="oh-my-claudecode:executor", model="haiku", prompt="为 Config 接口补充缺失的类型导出")
Task(subagent_type="oh-my-claudecode:executor", model="sonnet", prompt="实现带校验的 /api/users 端点")
Task(subagent_type="oh-my-claudecode:executor", model="sonnet", prompt="为 auth 中间件补充集成测试")
```
好的原因：独立任务处在合适的等级，且全部一次性发射。
</Good>

<Good>
正确使用后台执行：
```
Task(subagent_type="oh-my-claudecode:executor", model="sonnet", prompt="npm install && npm run build", run_in_background=true)
Task(subagent_type="oh-my-claudecode:executor", model="haiku", prompt="用新的 API 端点更新 README")
```
好的原因：长构建在后台运行，同时短任务在前台运行。
</Good>

<Bad>
对独立工作做顺序执行：
```
result1 = Task(executor, "添加类型导出")  # 等待...
result2 = Task(executor, "实现端点")     # 等待...
result3 = Task(executor, "添加测试")              # 等待...
```
不好的原因：这些任务是独立的。串行运行它们浪费时间。
</Bad>

<Bad>
等级选择错误：
```
Task(subagent_type="oh-my-claudecode:executor", model="opus", prompt="补一个漏掉的分号")
```
不好的原因：对一个微不足道的修复用 Opus 是昂贵的过度配置。改用带 Haiku 的 executor。
</Bad>
</Examples>

<Escalation_And_Stop_Conditions>
- 当直接调用 ultrawork（而非通过 ralph）时，只应用轻量验证 —— 构建通过、测试通过、无新错误
- 若需要完整持久化和全面的 architect 验证，建议切换到 `ralph` 模式
- 如果某任务在多次重试中反复失败，报告该问题，而非无限重试
- 当任务存在不清晰的依赖或相互冲突的需求时，升级给用户
</Escalation_And_Stop_Conditions>

<Final_Checklist>
- [ ] 所有并行任务已完成
- [ ] 构建/类型检查通过
- [ ] 受影响的测试通过
- [ ] 未引入新错误
</Final_Checklist>

## 并行会话注意事项

- **多仓库工作区锚点：** 在父目录放置一个 `.omc-workspace` 标记，使跨子仓库的多个会话共享同一个 `.omc/`。解析顺序：`OMC_STATE_DIR > .omc-workspace > git > cwd`。见 `docs/REFERENCE.md`。
- **会话 id 来源：** CLI 场景下 OMC_SESSION_ID 环境变量优先；hook 场景下 hook 载荷的 data.session_id 优先。
- **计划 id（如适用）：** Ultrawork 没有持久化状态；按设计，两次并发运行彼此独立。不需要 plan-id。
- **并行判定：** 支持（无状态组件）

<Advanced>
## 与其他模式的关系

```
ralph (持久化包装层)
 \-- 包含：ultrawork (本技能)
     \-- 提供：仅并行执行

autopilot (自主执行)
 \-- 包含：ralph
     \-- 包含：ultrawork (本技能)
```

Ultrawork 是并行层。Ralph 增加了持久化与验证。Autopilot 增加了完整的生命周期流水线。
</Advanced>
