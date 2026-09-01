# Loop 体系详细细化设计

生成时间: 2026-09-01
状态: 规划完成，待实施

---

## 一、现状诊断（各命令真实定位，非冗余）

| 命令 | 真实定位 | 实现位置 | 日志现状 |
|------|---------|---------|---------|
| `/loop` | **策略驱动 AI 引擎**（5 策略接 QueryEngine 真实执行） | `src/commands/loop/` | 事件系统完整（19 种 `LoopEvent`），但消费端 `onProgress` 用固定 UUID **覆盖成单行状态栏，历史全部丢失** |
| `/loop-v2` | **模式编排框架**（11 种通用编排模式：串行/并行/流水线/扇出/事件/状态机/共识/自愈/限速/优先级/链） | `src/commands/loop-v2/index.ts` | `saveCheckpoint` 按 `{loopId}.json` **单文件覆盖**，历史 checkpoint 丢失；`executeTask` 是 **stub 假执行** |
| `/loop-start-v2` | **启动器封装**（带选项解析、模式校验） | `src/commands/loop-start-v2/index.ts` | 同 stub，仅实现串行；无逐轮日志 |
| `/loop-status-v2` | **状态监控**（读 checkpoint/DLQ/metrics） | `src/commands/loop-status-v2/index.ts` | 完整，但因 checkpoint 被覆盖，**只能看最后状态，无法回溯** |
| 5 个策略命令 | 专用策略入口 | `.claude/commands/*.md` + `strategies/*.ts` | 文档齐全，策略真实实现，缺逐轮过程输出 |

### 核心矛盾（用户痛点）

**「全量检查错在哪」做不到**，因为：
1. `/loop` 引擎收到 19 种事件，但 `onProgress` 全部 `pushProgress(formatStatusLine(...))` 覆盖成单行 —— 中间每轮、每个任务、每次状态转移、每次失败原因，**全部被丢弃**。
2. `/loop-v2` 的 `saveCheckpoint` 用 `writeFileSync(join(dir, ${loopId}.json))` 单文件覆盖 —— 同一循环的 checkpoint 只保留最后一次。
3. `executeTask` 是 stub（`return { success: true, output: 'Executed: ' + task }`），无真实执行过程。

---

## 二、统一日志架构（四个方向的共同基础）

### 2.1 数据模型（JSONL 追加，每事件一行）

新增 `src/commands/loop/logger.ts`，所有 loop 命令共享：

```typescript
// 单条日志记录
interface LogEntry {
  ts: string          // ISO 时间戳
  loopId: string      // 循环 ID
  source: string      // 'loop' | 'loop-v2' | 'loop-start-v2' | 策略名
  pattern?: string    // 编排模式（loop-v2 系列）
  strategy?: string   // 策略名（loop 系列）
  iteration: number   // 迭代号
  level: 'debug' | 'info' | 'warn' | 'error'
  event: string       // LoopEvent.type 或自定义事件名
  detail: string      // 人类可读详情
  data?: unknown      // 结构化附加数据（任务ID、错误对象、状态转移等）
  tokens?: number     // token 消耗
  cost?: number       // 成本估算
}
```

### 2.2 三层输出模型

| 层 | 输出 | 消费端 | 用途 |
|----|------|--------|------|
| **L1 实时状态行** | 单行摘要（原地更新） | 现有 `progress-ui.ts` | 快速瞥一眼进度 |
| **L2 滚动日志** | 逐事件追加（历史保留） | **新增** `logger.ts` + 改造 `onProgress` | 屏幕回溯「错在哪」 |
| **L3 落盘 JSONL** | 结构化全量日志 | **新增** `logger.ts` appendLog | 离线全量检查、脚本分析 |
| **L4 最终报告** | 时间线 + 决策点 + 文件变更 | 增强 `--report` | 交付物 |

### 2.3 落盘目录约定

```
~/.doge/loops/
  logs/
    {loopId}.jsonl            # 每循环一个 JSONL（逐事件追加，可全量检查）
  checkpoints/
    {loopId}.json             # 最新状态（快照，用于恢复）
    {loopId}.{iteration}.json # 逐迭代快照（历史，可回溯）
  dead-letter-queue/
    {taskId}.json             # 死信
  metrics.json                # 汇总指标
```

---

## 三、方向 1：详细日志层（核心，用户最强调）

### 3.1 新增 `logger.ts`

```typescript
// appendLog: 追加一条日志到 JSONL（fs.appendFileSync，createWriteStream 缓冲）
// formatLogLine: 格式化为屏幕滚动日志行（时间戳 + 级别 + 事件 + 详情）
// LogSink: 封装日志文件句柄，循环结束 close
```

### 3.2 改造 `engine.ts` 的 emit

在 `emit` 函数（第 121 行）内，每次发射事件同时落盘：

```typescript
const emit = (event: LoopEvent) => {
  options.onProgress?.(event)
  if (logSink) logSink.append(toLogEntry(event))   // 新增：全量落盘
}
```

`toLogEntry` 把 19 种 `LoopEvent` 映射为 `LogEntry`（事件名、详情、任务ID、错误、token 等）。

### 3.3 改造 `index.tsx` 的 onProgress

从「覆盖单行」改为「顶部状态栏 + 滚动日志」：

- 保留 `pushProgress`（L1 状态行，单条 UUID 原地更新）
- 新增 `pushLog`（L2 滚动日志，**每条独立 UUID，不覆盖**），逐事件输出：
  - `iteration_start` → `[迭代 3/20] 开始`
  - `task_start` → `  ├─ 任务 [T3] 重构 utils/foo.ts`
  - `task_end` → `  ├─ ✅ [T3] 完成（输出 234 字符，新建 2 文件）`
  - `task_failed` → `  ├─ ❌ [T3] 失败: MODULE_NOT_FOUND ...`
  - `repair` → `  └─ 🔧 自动修复（第 1 次）`
  - `snapshot` → `  💾 快照 create: snap-xxx`
  - `evaluation` → `  🔍 评估: 未达成 — 测试仍有 3 失败`

### 3.4 新增命令选项

- `--verbose`：开启 L2 滚动日志（默认开启，`--quiet` 关闭）
- `--log <path>`：指定 JSONL 落盘路径（默认 `~/.doge/loops/logs/{loopId}.jsonl`）
- `--trace`：最终报告附带完整时间线

### 3.5 改造 `loop-v2` / `loop-start-v2`

- `saveCheckpoint` 改为「最新快照 + 逐迭代快照」双写
- `executeTask` 每次调用前/后追加日志（即使仍是 stub，也记录「调用参数 + 返回结果」）
- 死信队列写入时追加一条 `error` 级日志

### 3.6 改造 `loop-status-v2`

- 新增 `--trace <loopId>`：读取 `logs/{loopId}.jsonl`，按时间线重放完整执行轨迹
- 新增 `--logs`：列出所有日志文件及大小

---

## 四、方向 2：能力加强

### 4.1 熔断器落地（loop-v2 文档宣称但未实现）

`LoopConfig` 已有 `circuitBreakerThreshold: 5` 和 `circuitBreakerCooldownMs: 30000`，但无实现。落地：

```typescript
class CircuitBreaker {
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  // 连续失败 >= threshold → open（拒绝执行，快速失败）
  // cooldownMs 后 → half-open（允许试探一次）
  // 试探成功 → closed；失败 → open
}
```

在 `runSequentialLoop` / `runParallelLoop` 等入口接入，连续失败触发熔断，输出 `⚠️ 熔断器打开`。

### 4.2 token/成本实时追踪

- `executeTask` 返回结果携带 `tokens`，累积到 `LoopMetrics`
- 每轮迭代结束追加日志：`[迭代 3] tokens +12,000（累计 45,000）成本 ≈ $0.45`
- `/loop-status-v2 --metrics` 展示 token 消耗趋势

### 4.3 checkpoint 逐迭代持久化

- `engine.ts` 的 `saveCheckpoint`（第 903 行）改为：每次调用写 `{loopId}.json`（最新）+ `{loopId}.{iteration}.json`（历史）
- 崩溃后 `--checkpoint` 恢复可回溯到任意迭代

---

## 五、方向 3：功能扩展

### 5.1 打通 autonomous-loops 的 DAG 编排

`.claude/skills/.../autonomous-loops/SKILL.md` 定义了 6 种循环模式频谱。将 `/loop` 作为**原子执行单元**，新增高层编排：

- 新增 `/loop-orchestrate` 命令：读 DAG 定义（JSON），按依赖关系调度多个 `/loop` 实例
- 复用 `/loop` 已有的 `planner.ts`（`decomposeToDag` / `getReadyTasks` / `hasCycle` 已支持 DAG）

### 5.2 verification-loop 集成

- `/loop` 的 `--verify` 目前只支持 `test/build/lint/files`
- 扩展为 `--verify full`：接入 `verify.md` 的完整验证（构建+类型+lint+测试+console.log 审计+git 状态+安全扫描）
- 验证结果作为 `evaluation` 事件的 `reason`，失败自动触发 `repair`

### 5.3 死信队列操作入口

- `/loop-status-v2` 新增：
  - `--retry <taskId>`：从死信队列重新入队
  - `--discard <taskId>`：丢弃死信
  - `--review <taskId>`：标记已人工审查

---

## 六、方向 4：边界厘清（消除幻象集成，非删除）

### 6.1 stub 假执行接入真实执行

`loop-v2` / `loop-start-v2` 的 `executeTask` 当前是 stub。接入 `/loop` 的 `ai-task-executor.ts`：

```typescript
// 复用 loop 引擎的 createAITaskExecutor，而非重写
import { createAITaskExecutor } from '../loop/ai-task-executor.js'
```

这样两个命令真正执行 shell 命令/Agent 任务，而非返回假结果。

### 6.2 文档与实现对齐

重新对齐 `.claude/commands/*loop*.md`，明确：
- 每个命令对应的真实实现文件
- 移除指向不存在脚本/集成的描述（如 `loop-operator-v2.md` 的 `--loop-pipeline`）

### 6.3 命令职责矩阵（明确各自边界）

| 命令 | 定位 | 何时用 |
|------|------|--------|
| `/loop` | 目标→策略→分解→执行→验证（AI 引擎） | 有明确目标，需要智能分解 |
| `/loop-v2` | 11 种编排模式（框架级） | 已知任务列表，需要编排模式 |
| `/loop-start-v2` | 带选项的启动器 | 需要命令行选项控制 |
| `/loop-status-v2` | 监控 + 日志回溯 | 查看执行状态/排查问题 |
| 5 策略命令 | 特定策略快捷入口 | 明确用哪个策略 |

---

## 七、实施顺序

```
第 1 步：方向 1 详细日志层（核心，用户最强调）── 见效快，且是后续排查的基础
第 2 步：方向 2 能力加强（熔断器/token/checkpoint）
第 3 步：方向 4 边界厘清（stub 接入真实执行，否则日志记录的是假执行）
第 4 步：方向 3 功能扩展（DAG/verification/死信操作）
```

> 注：方向 4 的 stub 接入应在方向 3 之前完成，否则扩展功能建立在假执行之上。

---

## 八、风险与回滚

1. **日志量大**：L3 JSONL 每事件一行，长时间循环可能很大 → 用 `createWriteStream` 缓冲写 + `--log` 可选，默认只写 L2 屏幕日志
2. **性能**：`appendFileSync` 同步写会阻塞 → 用流式异步写，循环结束 `close`
3. **兼容性**：新增选项不破坏现有 `--json` / `--report` / `--checkpoint` 行为，均为增量
4. **回滚**：每个方向独立提交，`git revert` 可单独回滚
