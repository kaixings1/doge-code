# Phase 16: 高星项目功能吸收计划
> 2026-08-16 | 来源: .github/ 目录分析

## 目标
从 CoreCoder / DeepSeek-Reasonix / oh-my-pi 吸收 4 个高价值功能，以中文版为主。

---

## 16.1 /replay 会话重放
- **来源**: DeepSeek-Reasonix (⭐27k) — `/replay` 会话重放
- **功能**: 读取历史 session JSONL，按轮次重放工具调用链（只展示，不执行）
- **复用**: `session-search.ts` 的 `readSessionLite` / `gatherAllCandidates` / `parseSessionInfoFromLite`
- **实现**:
  - `src/commands/replay/index.ts` — 命令定义
  - `src/commands/replay/replay.ts` — `call()` 实现
  - 参数: `--session <id>` 指定会话；`--limit N` 限制轮次；默认最近会话
  - 输出格式: 轮次序号 | 角色 | 摘要 | 工具调用（如有）
- **测试**: replay.test.ts

## 16.2 /prune-sessions 清理过期会话
- **来源**: DeepSeek-Reasonix — `/prune-sessions` 清理过期会话
- **功能**: 扫描 sessions 目录，按 --older-than N 天删除 JSONL 文件
- **复用**: `session-search.ts` 的 `listCandidates` + `readSessionLite`
- **实现**:
  - `src/commands/prune-sessions/index.ts`
  - `src/commands/prune-sessions/prune-sessions.ts`
  - 参数: `--older-than N`（天数，默认 30）；`--dry-run` 只显示不删除；`--force` 跳过确认
  - 安全: 默认 dry-run + 二次确认，删除前打印拟删除列表
- **测试**: prune-sessions.test.ts

## 16.3 /tokens 实时用量展示
- **来源**: CoreCoder (⭐18k) — `/tokens` token 用量和费用估算
- **功能**: 实时显示当前会话累计 prompt/completion/total tokens + 费用 + 上下文窗口占比
- **复用**: `cost-tracker.ts` 已有 `getTotalInputTokens/getTotalOutputTokens/getTotalCostUSD`；`utils/tokens.ts` 的 `tokenCountWithEstimation`
- **实现**:
  - `src/commands/tokens/index.ts`
  - `src/commands/tokens/tokens.ts`
  - 输出: 累计 tokens | 费用估算 | 上下文窗口占比 | 按模型 breakdown
- **测试**: tokens.test.ts

## 16.4 /checkpoint 操作检查点
- **来源**: oh-my-pi (⭐18k) — `/checkpoint` 检查点
- **注意**: `rewind` 已有 aliases `['checkpoint', 'undo']`，但 rewind.ts 当前为 stub
- **功能**: 在执行操作前创建 git stash + 文件快照，支持回滚
- **复用**: `rewind.ts` 增强实现；`snapshot/snapshot.ts` 模式
- **实现**:
  - 增强 `src/commands/rewind/rewind.ts`（当前返回 skip）
  - 支持: `checkpoint create <name>` / `checkpoint list` / `checkpoint restore <name>`
  - 底层: `git stash push -m "checkpoint:<name>"` + 记录时间戳
- **测试**: 集成到 rewind.test.ts

---

## 执行顺序
1. 16.1 replay（2h）— 新建命令
2. 16.3 tokens（1h）— 新建命令，复用 cost-tracker
3. 16.2 prune-sessions（1.5h）— 新建命令，复用 session-search 工具函数
4. 16.4 checkpoint（2h）— 增强 rewind（不新建，修改现有）

**总计**: ~6.5h

## 验证
- 每项完成后运行相关测试
- 最终编译验证: `bun run build` 或 `tsc --noEmit`
- 更新 TASK.md
