# Loop 引擎增强计划

生成时间: 2026-09-01
状态: 执行中

---

## 审计结论

对 `.claude/commands/*loop*` 和 `.claude/agents/*loop*` 共 12 个文件逐项审计后，发现以下问题：

| 优先级 | 组件 | 问题 | 操作 |
|--------|------|------|------|
| P0 | `ralph-loop.md` | 12行骨架，指向不存在的脚本 | 补全实现 |
| P0 | 内置 `/loop` | 返回空内容 | 排查并修复 |
| P1 | `loop-status.md` | 过度依赖外部CLI `ecc-universal` | 增加本地回退 |
| P1 | `plan-loop.md` | 依赖 `/loop` 空结果链 | 增加fallback |
| P2 | `loop-dashboard.md` | 有规范无实现 | 实现最小版本 |
| P2 | `loop-operator-v2.md` | 集成点可能不存在 | 验证并补充 |
| P3 | 5个策略命令 | crew/autogpt/langgraph/openhands/swe-agent 有描述无命令文件 | ✅ 全部新建完成 |

---

## Phase 1: P0 修复（ralph-loop + /loop 空返回）

### 1.1 ralph-loop.md 补全
- 当前：12行，`allowed-tools` 指向不存在的 `scripts/setup-ralph-loop.sh`
- 目标：实现完整的 Ralph 循环工作流
  - Ralph 循环 = 迭代式任务分解 + 执行 + 验证
  - 类似 `/loop` 但带有自动任务分解能力
  - 支持 `--max-iterations`、`--completion-promise`
- 文件：`.claude/commands/ralph-loop.md`

### 1.2 /loop 空返回排查
- 检查 `~/.claude/settings.json` 中 `/loop` 配置
- 确认 prompt 长度是否超限
- 修复或精简 prompt

---

## Phase 2: P1 增强（loop-status + plan-loop）

### 2.1 loop-status.md 增加本地回退
- 当前：只支持 `ecc-universal` CLI 跨会话查看
- 增加：直接读取 `~/.claude/loops/` 下的 JSON 文件
- 增加：本地文件系统 fallback 逻辑

### 2.2 plan-loop.md 增加 fallback
- 当前：递归调用 `/loop`，依赖其返回非空
- 增加：如果 `/loop` 返回空，使用内置的循环逻辑
- 增加：独立于 `/loop` 的规划检查提示

---

## Phase 3: P2 实现（loop-dashboard + 集成验证）

### 3.1 loop-dashboard 最小实现
- 当前：有完整规范但无实现代码
- 目标：创建最小可用的 Web 监控面板
  - `src/server/loop-dashboard.ts` — 路由处理
  - `public/loop-dashboard.html` — 前端页面
  - 读取 `~/.doge/loops/` 下的检查点/指标/死信队列

### 3.2 loop-operator-v2.md 集成验证
- 验证 BackgroundManager、Cron、Queue、Event Stream 集成点是否存在
- 不存在的标记为 `future`，存在的补充示例

---

## Phase 4: P3 新增策略命令

### 4.1 新建 5 个策略命令文件
每个文件包含：
- 命令描述和参数
- 策略说明
- 使用示例
- 与 loop-operator-v2 的集成方式

| 命令文件 | 策略 | 核心逻辑 |
|----------|------|----------|
| `.claude/commands/loop-crew.md` | Crew | 多 agent 角色分配 + 协作 |
| `.claude/commands/loop-autogpt.md` | AutoGPT | 目标驱动 + 自主规划 + 工具调用 |
| `.claude/commands/loop-langgraph.md` | LangGraph | 状态图 + 条件路由 + 循环 |
| `.claude/commands/loop-openhands.md` | OpenHands | 代码修改 + 测试 + 提交 |
| `.claude/commands/loop-swe-agent.md` | SWE-Agent | 问题定位 + 修复 + 验证 |

---

## 执行规则

1. **YAGNI 阶梯**：每个命令只写最少的能工作的代码
2. **增量提交**：每个 Phase 完成后独立提交
3. **功能只增不减**：不删除任何现有功能
4. **逐项验证**：每完成一项检查下一项
