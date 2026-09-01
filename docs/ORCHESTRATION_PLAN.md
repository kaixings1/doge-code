# 编排功能落地与迁移方案

生成时间: 2026-09-01
状态: 规划完成，待评审

---

## 一、现状诊断

### 1.1 三套编排机制对比

| 命令 | 机制 | 调度对象 | 可靠性保障 |
|------|------|---------|-----------|
| `/orchestrate` | prompt 驱动（AI 读 md 自己调用） | **Agent 链**（planner→tdd-guide→code-reviewer→security-reviewer） | ❌ 无（无 checkpoint/死信/熔断） |
| `/workflow/orchestrate` | prompt 驱动（AI 分解/排序/标记） | 任务分解 + 依赖排序 | ❌ 无 |
| `/loop-v2` | **代码驱动**（真实引擎 926 行） | shell 任务（11 种模式） | ✅ 熔断器/死信队列/checkpoint/token 追踪/日志 |

### 1.2 核心矛盾

- `/orchestrate` 的价值 = **Agent 链编排**（调用 subagent），但它是 prompt 驱动的「AI 自己看着办」——没有真实的调度代码、没有 checkpoint、没有死信队列、没有熔断器、没有进度日志。
- `/loop-v2` 有真实的编排引擎（11 种模式 + 熔断 + 死信 + checkpoint + token + 日志），但它的 `executeTask` 只能调度 **shell 命令**（`executeTaskWithStrategy`），**不能调度 Agent（subagent）**。

**结论**：缺的是一个「能调度 Agent 节点的编排引擎」——把 `/orchestrate` 的 Agent 链价值，落到 `/loop-v2` 的真实引擎上。

### 1.3 可行性验证（已确认）

- `LocalCommandCall = (args, context?)` → `/loop-v2` 的 `call` 能拿到 `context`（含 `ToolUseContext`），当前只是被忽略成了 `_context`。
- `ToolUseContext.options` 里有 `agentDefinitions: AgentDefinitionsResult`（subagent 定义）和 `tools: Tools`（工具池）。
- `runAgent()` 已存在（`src/tools/AgentTool/runAgent.ts:247`），可调度 subagent，但 API 复杂（需组装 agentDefinition/promptMessages/toolUseContext/canUseTool/availableTools 等参数）。

---

## 二、方案设计（分 3 阶段，YAGNI 阶梯）

### 阶段 1：loop-v2 假执行升级为真 AI 执行（已实施 ✅）

**目标**：让 `/loop-v2` 的编排引擎驱动**真实的 AI 执行**，而非静态关键词匹配。

**实施结果**（`src/commands/loop-v2/index.ts`）：

1. `call` 签名 `(args, _context)` → 保存 `activeContext`（local 命令已验证可拿到完整 context）
2. `executeTask` 增加「真 AI 回退」分支：
   - 简单命令（`test`/`lint`/`build`/`git` 等关键词）→ 走 `executeTaskWithStrategy`（快速 shell，不耗 API）
   - 复杂任务（关键词匹配不到，返回「规划模式」）→ 回退到 `createAITaskExecutor`（调 LongCat API 生成并执行 bash 命令 + 错误恢复）

**复用**：checkpoint / 死信队列 / 熔断器 / token 追踪 / 日志 —— 全部现有，AI 节点自动继承。

**关键决策**：`runAgent`（完整 subagent 调度）集成复杂（需组装 agentDefinition + canUseTool + assembleToolPool + querySource 等 20+ 参数，且存在循环依赖风险），故阶段 1 先复用 `createAITaskExecutor`（真 AI，已验证、无循环依赖）。`runAgent` 完整 subagent 调度留作阶段 1.5 单独评估。

**产出效果**：
```bash
# 复杂任务（非 lint/test/build 关键词）现在会走真 AI 生成并执行 bash 命令
/loop-v2 sequential "创建一个完整的 Todo List 应用"
/loop-v2 pipeline "重构 utils 目录" "运行测试" "生成文档"
```

### 阶段 2：新增 `/loop-orchestrate` 命令（编排定义层）

**目标**：把 `/orchestrate` 的 4 个工作流模板映射为 agent 链，交给 loop-v2 引擎执行。

**改动点**：

1. 新建 `src/commands/loop-orchestrate/index.ts`（`LocalCommand`，非 JSX）
2. 内置 4 个模板（映射到 `runAgent` 的 subagent_type）：

| workflow-type | agent 序列 |
|---------------|-----------|
| `feature` | planner → tdd-guide → code-reviewer → security-reviewer |
| `bugfix` | planner → tdd-guide → code-reviewer |
| `refactor` | architect → code-reviewer → tdd-guide |
| `security` | security-reviewer → code-reviewer → architect |

3. 解析参数 → 生成 agent 节点序列 → 调用阶段 1 的引擎执行（复用 pipeline 模式）
4. 复用 `/orchestrate` 的 HANDOFF 交接文档格式 + 最终报告格式

**保留**：`/orchestrate`（prompt 版）暂不删除，作为「无引擎时的兜底」；`/loop-orchestrate` 成为推荐入口。

### 阶段 3：自定义 Agent DAG 编排（可选，按需）

**目标**：支持自定义 agent 依赖图（非简单链式）。

**改动点**：
- 新增 `--graph <file.json>` 选项，读取 DAG 定义（节点 = agent，边 = 依赖）
- 复用 `/loop` 的 `planner.ts`（`topoSort` / `getReadyTasks` / `hasCycle` 已就绪）

**YAGNI 判断**：阶段 3 是「明确需求出现前」不做。当前 `/workflow/orchestrate` 的「依赖排序 + 并行识别」可用阶段 1 的 `parallel`/`fanout` 模式部分覆盖，无需立即上 DAG。

---

## 三、实施顺序与优先级

```
阶段 1（P0，核心）：loop-v2 假执行 → 真 AI 执行 —— 已实施 ✅
阶段 2（P1，收口）：/loop-orchestrate 模板命令 —— 让用户有引擎化入口
阶段 3（P2，暂缓）：DAG 编排 —— 等明确需求
```

---

## 四、关键风险与对策

| 风险 | 对策 |
|------|------|
| `runAgent()` API 复杂，参数组装易错 | 阶段 1 只封装最小参数集，先跑通 planner 单 agent，再扩展 |
| subagent 是异步生成器，与 loop-v2 的同步 `executeTask` 不匹配 | agentExecutor 内部 `for await` 收集 `runAgent` 输出，收敛为同步返回 |
| agent 权限（canUseTool/availableTools）组装 | 复用 AgentTool.tsx 的组装逻辑，不重复造轮子 |
| 破坏现有 `/loop-v2` shell 模式 | `agent:` 前缀区分，shell 模式路径完全不变 |

---

## 五、YAGNI 边界（明确不做）

1. ❌ 不重写 `/orchestrate`、`/workflow/orchestrate` 的 md（它们作为 prompt 兜底保留）
2. ❌ 不新建独立的编排引擎（复用 loop-v2 现有引擎）
3. ❌ 不实现分布式/多进程编排（当前单进程够用）
4. ❌ 阶段 3 的 DAG 编排（等明确需求）
5. ❌ 不引入新依赖（runAgent 已存在，纯复用）

---

## 六、验收标准

阶段 1 完成标志：
- `/loop-v2 pipeline "agent:planner 分析 X"` 能真正调度 planner subagent（非 shell）
- agent 节点失败进入死信队列，连续失败触发熔断器
- agent 节点输出被 checkpoint 逐迭代记录，日志可回溯

阶段 2 完成标志：
- `/loop-orchestrate feature "Add user auth"` 跑通 4-agent 链
- 输出符合 `/orchestrate` 的 HANDOFF + 最终报告格式
