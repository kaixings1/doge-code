---
name: 超级工作
description: "超级工作 — 独立任务的并行执行引擎和协议"
参数-hint: "<task description with parallel work items>"
level: 4
---

# UltraWork

<目的>
Ultrawork是独立任务的并行执行引擎和执行协议。它强调意图基础、并行上下文收集、非平凡工作的依赖感知任务图以及简洁的基于证据的执行摘要。它是一个组件，不是独立的持久化模式 — 它提供并行性和路由指导，但不提供持久化、验证循环或长期状态管理。
</目的>

<使用时机>
- 多个独立任务可以同时运行
- 用户说"ulw"、"ultrawork"，或想要并行执行
- 您需要一次将工作委托给多个代理
- 任务受益于并发执行，但用户将自行管理完成
</使用时机>

<不使用时机>
- 任务需要带验证的保证完成 — 使用`ralph`代替（ralph包含ultrawork）
- 任务需要完整的自主管道 — 使用`autopilot`代替（autopilot包含ralph，ralph包含ultrawork）
- 只有一个顺序任务，没有并行机会 — 直接委托给执行器代理
- 用户需要会话持久化以恢复 — 使用`ralph`，它在ultrawork之上添加持久化
</不使用时机>

<存在原因>
当任务独立时，顺序任务执行浪费时间。Ultrawork能够同时启动多个代理并将每个代理路由到正确的模型层，减少总执行时间同时控制令牌成本。它被设计为可组合组件，ralph和autopilot在其基础上构建。
</存在原因>

<执行策略>
- 同时启动所有独立代理调用 — 切勿序列化独立工作
- 委托时始终明确传递`model`参数
- 首次委托前阅读`docs/shared/agent-tiers.md`以获取代理选择指导
- 对于超过约30秒的操作（安装、构建、测试）使用`run_in_background: true`
- 在后台运行快速命令（git状态、文件读取、简单检查）
- 在实现之前解决意图和不确定性；先探索，仅在仍然阻塞时询问
- 对于非平凡任务，在执行前生成具有并行波次的依赖感知计划
- 保持委托任务报告简洁：简短摘要、触及的文件、验证状态、阻塞项
- 手动QA对于实现的行为是必需的，不仅仅是诊断
</执行策略>

<步骤>
1. **阅读代理参考**：加载`docs/shared/agent-tiers.md`以进行层选择
2. **首先确定意图**：确认请求是实现、调查、评估还是研究；在明确之前不要编码
3. **并行收集上下文**：
   - 直接工具进行快速读取/搜索
   - 探索/文档代理获取广泛上下文
4. **按独立性分类任务**：识别哪些任务可以并行运行，哪些有依赖关系
5. **为非平凡工作创建任务图**：
   - 并行执行波次
   - Dependency Matrix
   - acceptance criteria and verification steps per task
6. **Route to correct tiers**:
   - Simple lookups/definitions: LOW tier (Haiku)
   - Standard implementation: MEDIUM tier (Sonnet)
   - Complex analysis/refactoring: HIGH tier (Opus)
7. **Fire independent tasks simultaneously**: Launch all parallel-safe tasks at once
8. **Run dependent tasks sequentially**: Wait for 前提条件 before launching dependent work
9. **Background long operations**: Builds, installs, and test suites use `run_in_background: true`
10. **Verify when all tasks complete** (lightweight):
   - Build/typecheck passes
   - Affected tests pass
   - Manual QA completed for implemented behavior
   - No new errors introduced
</Steps>

<Tool_用法>
- Use `Task(subagent_type="oh-my-claudecode:executor", model="haiku", ...)` for simple changes
- Use `Task(subagent_type="oh-my-claudecode:executor", model="sonnet", ...)` for standard work
- Use `Task(subagent_type="oh-my-claudecode:executor", model="opus", ...)` for complex work
- Use `run_in_background: true` for package installs, builds, and test suites
- Use foreground execution for quick status checks and file operations
</Tool_用法>

<示例>
<Good>
Three independent tasks fired simultaneously:
```
Task(subagent_type="oh-my-claudecode:executor", model="haiku", prompt="Add missing type export for Config interface")
Task(subagent_type="oh-my-claudecode:executor", model="sonnet", prompt="Implement the /api/users 端点 with validation")
Task(subagent_type="oh-my-claudecode:executor", model="sonnet", prompt="Add 集成 tests for the auth 中间件")
```
Why good: Independent tasks at appropriate tiers, all fired at once.
</Good>

<Good>
Correct use of background execution:
```
Task(subagent_type="oh-my-claudecode:executor", model="sonnet", prompt="npm install && npm run build", run_in_background=true)
Task(subagent_type="oh-my-claudecode:executor", model="haiku", prompt="Update the README with new API endpoints")
```
Why good: Long build runs in background while short task runs in foreground.
</Good>

<Bad>
Sequential execution of independent work:
```
result1 = Task(executor, "Add type export")  # wait...
result2 = Task(executor, "Implement 端点")     # wait...
result3 = Task(executor, "Add tests")              # wait...
```
Why bad: These tasks are independent. Running them sequentially wastes time.
</Bad>

<Bad>
Wrong tier selection:
```
Task(subagent_type="oh-my-claudecode:executor", model="opus", prompt="Add a missing semicolon")
```
Why bad: Opus is expensive overkill for a trivial fix. Use executor with Haiku instead.
</Bad>
</示例>

<Escalation_And_Stop_Conditions>
- When ultrawork is invoked directly (not via ralph), apply lightweight verification only -- build passes, tests pass, no new errors
- For full persistence and comprehensive architect verification, recommend switching to `ralph` mode
- If a task fails repeatedly across retries, report the issue rather than retrying indefinitely
- Escalate to the user when tasks have unclear dependencies or conflicting requirements
</Escalation_And_Stop_Conditions>

<Final_Checklist>
- [ ] All parallel tasks completed
- [ ] Build/typecheck passes
- [ ] Affected tests pass
- [ ] No new errors introduced
</Final_Checklist>

## Parallel 会话 caveats

- **Multi-repo workspace anchor:** drop a `.omc-workspace` marker at the parent directory so multiple sessions across sub-repos share one `.omc/`. Resolution order: `OMC_STATE_DIR > .omc-workspace > git > cwd`. See `docs/REFERENCE.md`.
- **会话 id source:** OMC_SESSION_ID env var wins in CLI contexts; hook 载荷 data.session_id wins in hook contexts.
- **Plan id (when applicable):** Ultrawork has no persistent state; two concurrent runs are independent by design. No plan-id needed.
- **Parallel verdict:** supported (stateless component)

<Advanced>
## Relationship to Other Modes

```
ralph (persistence wrapper)
 \-- includes: ultrawork (this skill)
     \-- provides: parallel execution only

autopilot (autonomous execution)
 \-- includes: ralph
     \-- includes: ultrawork (this skill)
```

Ultrawork is the parallelism layer. Ralph adds persistence and verification. Autopilot adds the full lifecycle pipeline.
</Advanced>
