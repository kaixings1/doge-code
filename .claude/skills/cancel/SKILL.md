---
name: cancel
aliases: [cancel-ralph]
description: 取消任何活动的 OMC 模式（autopilot、ralph、ultrawork、ultraqa、swarm、ultrapilot、pipeline、team）。
argument-hint: "[--force|--all]"
level: 2
---

# Cancel 技能

智能取消：检测并取消活动的 OMC 模式。

**cancel 技能是完成并退出任何 OMC 模式的标准方式。**
当 stop hook 检测到工作已完成时，它会指示 LLM 调用
此技能以进行正确的状态清理。如果 cancel 失败或被中断，
用 `--force` 标志重试，或作为最后手段等待 2 小时的陈旧超时。

## 它做什么

自动检测哪个模式处于活动状态并取消它：
- **Autopilot**：停止工作流，保留进度以便恢复
- **Ralph**：停止持久化循环，如适用则清除关联的 ultrawork
- **Ultrawork**：停止并行执行（独立或关联）
- **UltraQA**：停止 QA 循环工作流
- **Swarm**：停止协调的代理集群，释放已认领的任务
- **Ultrapilot**：停止并行 autopilot worker
- **Pipeline**：停止顺序代理流水线
- **Team**：通过活动的 team/对话面向所有队友请求关闭，等待响应/超时，清除 OMC team 状态，如存在则清除关联的 ralph。Claude Code 2.1.178+ 没有 TeamDelete。
- **Team+Ralph（关联）**：先取消 team（优雅关闭），然后清除 ralph 状态。在关联状态下取消 ralph 也会先取消 team。

## 用法

```
/oh-my-claudecode:cancel
```

或说："cancelomc"、"stopomc"

## 关键：延迟工具处理

状态管理工具（`state_clear`、`state_read`、`state_write`、`state_list_active`、
`state_get_status`）可能被 Claude Code 注册为**延迟工具**。调用任何状态工具之前，
你**必须**先通过 `ToolSearch` 加载全部这些工具：

```
ToolSearch(query="select:mcp__plugin_oh-my-claudecode_t__state_clear,mcp__plugin_oh-my-claudecode_t__state_read,mcp__plugin_oh-my-claudecode_t__state_write,mcp__plugin_oh-my-claudecode_t__state_list_active,mcp__plugin_oh-my-claudecode_t__state_get_status")
```

如果 `state_clear` 不可用或失败，用这个 **bash 回退方案**作为**从 stop hook 循环中逃出的紧急手段**。它**不是** cancel 流程的完整替代 —— 它只移除状态文件以解除会话阻塞。关联模式（例如 ralph→ultrawork、
autopilot→ralph/ultraqa）必须通过为每个模式各运行一次该回退方案来分别清除。

把 `MODE` 替换为具体模式（例如 `ralplan`、`ralph`、`ultrawork`、`ultraqa`）。

**警告：** 不要对 `autopilot` 或 `omc-teams` 使用此回退方案。Autopilot 需要
`state_write(active=false)` 来保留恢复数据。omc-teams 需要 tmux 会话
清理，仅靠删除文件做不到。

```bash
# 回退方案：当 state_clear MCP 工具不可用时直接删除文件
SESSION_ID="${CLAUDE_SESSION_ID:-${CLAUDECODE_SESSION_ID:-}}"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || { d="$PWD"; while [ "$d" != "/" ] && [ ! -d "$d/.omc" ]; do d="$(dirname "$d")"; done; echo "$d"; })"

# 跨平台 SHA-256（macOS：shasum，Linux：sha256sum）
sha256portable() { printf '%s' "$1" | (sha256sum 2>/dev/null || shasum -a 256) | cut -c1-16; }

# 解析状态目录（支持 OMC_STATE_DIR 集中式存储）
if [ -n "${OMC_STATE_DIR:-}" ]; then
  # 镜像 worktree-paths.ts 中的 getProjectIdentifier()
  SOURCE="$(git remote get-url origin 2>/dev/null || echo "$REPO_ROOT")"
  HASH="$(sha256portable "$SOURCE")"
  DIR_NAME="$(basename "$REPO_ROOT" | sed 's/[^a-zA-Z0-9_-]/_/g')"
  OMC_STATE="$OMC_STATE_DIR/${DIR_NAME}-${HASH}/state"
  [ ! -d "$OMC_STATE" ] && { echo "ERROR: 在 $OMC_STATE 未找到状态目录" >&2; exit 1; }
elif [ "$REPO_ROOT" != "/" ] && [ -d "$REPO_ROOT/.omc" ]; then
  OMC_STATE="$REPO_ROOT/.omc/state"
else
  echo "ERROR: 无法定位 .omc 状态目录" >&2
  exit 1
fi
MODE="ralplan"  # <-- 替换为目标模式

# 清除特定模式的会话作用域状态
if [ -n "$SESSION_ID" ] && [ -d "$OMC_STATE/sessions/$SESSION_ID" ]; then
  rm -f "$OMC_STATE/sessions/$SESSION_ID/${MODE}-state.json"
  rm -f "$OMC_STATE/sessions/$SESSION_ID/${MODE}-stop-breaker.json"
  rm -f "$OMC_STATE/sessions/$SESSION_ID/skill-active-state.json"
  # 写入取消信号，以便 stop hook 检测到取消正在进行
  NOW_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  EXPIRES_ISO="$(date -u -d "+30 seconds" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || python3 - <<'PY'\nfrom datetime import datetime, timedelta, timezone\nprint((datetime.now(timezone.utc) + timedelta(seconds=30)).strftime('%Y-%m-%dT%H:%M:%SZ'))\nPY\n)"
  printf '{"active":true,"requested_at":"%s","expires_at":"%s","mode":"%s","source":"bash_fallback"}' \
    "$NOW_ISO" "$EXPIRES_ISO" "$MODE" > "$OMC_STATE/sessions/$SESSION_ID/cancel-signal-state.json"
fi

# 仅在没有 session ID 时清除旧状态（避免清除另一个会话的状态）
if [ -z "$SESSION_ID" ]; then
  rm -f "$OMC_STATE/${MODE}-state.json"
fi
```

## 自动检测

`/oh-my-claudecode:cancel` 遵循会话感知的状态契约：
- 默认情况下，命令通过 `state_list_active` 和 `state_get_status` 检查当前会话，遍历 `.omc/state/sessions/{sessionId}/…` 以发现哪个模式处于活动状态。
- 当提供了 session id 或已知时，该会话级路径是权威来源。仅当 session id 缺失或为空时，才把 `.omc/state/*.json` 中的旧文件作为兼容性回退来查询。
- Swarm 是共享的 SQLite/标记文件模式（`.omc/state/swarm.db` / `.omc/state/swarm-active.marker`），不是会话级的。
- 默认清理流程会带 session id 调用 `state_clear`，只移除匹配的会话文件；模式始终绑定到其来源会话。

活动的模式仍按依赖顺序取消：
1. Autopilot（包含关联的 ralph/ultraqa/ 清理）
2. Ralph（清理其关联的 ultrawork 或 ）
3. Ultrawork（独立）
4. UltraQA（独立）
5. Swarm（独立）
6. Ultrapilot（独立）
7. Pipeline（独立）
8. Team（Claude Code 原生）
9. OMC Teams（tmux CLI worker）
10. Plan Consensus（独立）
11. Self-Improve（独立 —— 清除状态、清理孤立 worktree、保留 iteration_state 以便恢复、在解析出的 `<self-improve-root>/state/agent-settings.json` 中设置 status: "user_stopped"；新运行使用 `.omc/self-improve/topics/<topic-slug>/`，扁平的 `.omc/self-improve/` 仅为旧版单轨恢复保留）

## 强制清除全部

当你需要抹除每个会话外加旧工件时（例如完全重置工作区），使用 `--force` 或 `--all`。

```
/oh-my-claudecode:cancel --force
```

```
/oh-my-claudecode:cancel --all
```

底层步骤：
1. `state_list_active` 枚举 `.omc/state/sessions/{sessionId}/…` 找出所有已知会话。
2. 每个会话运行一次 `state_clear` 以删除该会话的文件。
3. 不带 `session_id` 的全局 `state_clear` 移除 `.omc/state/*.json`、`.omc/state/swarm*.db` 下的旧文件和兼容性工件（见清单）。
4. Team 工件（`~/.claude/teams/*/`、`~/.claude/tasks/*/`、`.omc/state/team-state.json`）作为旧版回退的一部分尽力清除。
   - 原生 team 的 cancel **不影响** omc-teams 状态，反之亦然。

每条 `state_clear` 命令都遵循 `session_id` 参数，因此即使是 force 模式，也会先使用会话感知路径，然后才删除旧文件。

旧版兼容清单（仅在 `--force`/`--all` 下移除）：
- `.omc/state/autopilot-state.json`
- `.omc/state/ralph-state.json`
- `.omc/state/ralph-plan-state.json`
- `.omc/state/ralph-verification.json`
- `.omc/state/ultrawork-state.json`
- `.omc/state/ultraqa-state.json`
- `.omc/state/swarm.db`
- `.omc/state/swarm.db-wal`
- `.omc/state/swarm.db-shm`
- `.omc/state/swarm-active.marker`
- `.omc/state/swarm-tasks.db`
- `.omc/state/ultrapilot-state.json`
- `.omc/state/ultrapilot-ownership.json`
- `.omc/state/pipeline-state.json`
- `.omc/state/omc-teams-state.json`
- `.omc/state/plan-consensus.json`
- `.omc/state/ralplan-state.json`
- `.omc/state/boulder.json`
- `.omc/state/hud-state.json`
- `.omc/state/subagent-tracking.json`
- `.omc/state/subagent-tracker.lock`
- `.omc/state/rate-limit-daemon.pid`
- `.omc/state/rate-limit-daemon.log`
- `.omc/state/checkpoints/` （目录）
- `.omc/state/sessions/` （清除会话后清理空目录）

## 实现步骤

当你调用此技能时：

### 1. 解析参数

```bash
# 检查 --force 或 --all 标志
FORCE_MODE=false
if [[ "$*" == *"--force"* ]] || [[ "$*" == *"--all"* ]]; then
  FORCE_MODE=true
fi
```

### 2. 检测活动模式

该技能现在依赖会话感知的状态契约，而非硬编码的文件路径：
1. 调用 `state_list_active` 枚举 `.omc/state/sessions/{sessionId}/…` 并发现每个活动会话。
2. 对每个 session id，调用 `state_get_status` 得知正在运行哪个模式（`autopilot`、`ralph`、`ultrawork` 等）以及是否存在依赖模式。
3. 如果向 `/oh-my-claudecode:cancel` 传入了 `session_id`，则完全跳过旧版回退，只在该会话路径内操作；否则，仅在状态工具报告无活动会话时，才查询 `.omc/state/*.json` 中的旧文件。Swarm 仍是会话作用域之外的共享 SQLite/标记文件模式。
4. 本文档中的任何取消逻辑都遵循通过状态工具发现的依赖顺序（autopilot → ralph → …）。

### 3A. 强制模式（如果 --force 或 --all）

使用强制模式通过 `state_clear` 清除每个会话外加旧工件。仅当状态工具报告无活动会话时，才保留直接删除文件用于旧版清理。

### 3B. 智能取消（默认）

#### 如果 Team 处于活动状态（Claude Code 隐式 team）

Team 是通过 OMC team 状态检测的，而非通过已移除的 Claude Code `~/.claude/teams` 配置目录：

```bash
# 检查是否有活动的 OMC team 状态
state_read(mode="team")
```

**两轮取消协议：**

**第 1 轮：优雅关闭**
```
针对活动的 OMC team 状态：
  1. 从 OMC 状态/handoffs/任务记录中读取 team_name 和 worker 标签
  2. 对每个活动的队友：
     a. 通过活动的对话/team 消息通道询问或通知指定名称的队友
     b. 最多等待 15 秒以获取 shutdown_response
     c. 如果收到响应：标记该成员已确认
     d. 如果超时：标记该成员无响应，继续下一个
  3. 记录："优雅关闭轮次：X/Y 名成员已响应"
```

**第 2 轮：对账**
```
优雅关闭轮次之后：
  1. 再等待 5 秒，给可能仍在处理的无响应队友留出时间
  2. 在取消报告中记录所有仍无响应的队友
  3. 不要调用 TeamDelete；Claude Code 2.1.178+ 已移除针对单个 team 的原生清理
```

**OMC 状态清理：**
```
  1. 清除 team 状态：state_clear(mode="team")
  2. 检查是否有关联的 ralph：state_read(mode="ralph") —— 如果 linked_team 为 true：
     a. 清除 ralph 状态：state_clear(mode="ralph")
     b. 如存在则清除关联的 ultrawork：state_clear(mode="ultrawork")
  3. 仅对旧版 `omc team` / `/omc-teams` worker 运行 OMC tmux/CLI 孤儿扫描（见下文）
  4. 输出结构化取消报告
```

**孤儿检测（清理后）：**

对于旧版 OMC tmux/CLI worker 运行，验证没有残留的 worker 进程：
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cleanup-orphans.mjs" --team-name "{team_name}"
```

孤儿扫描器：
1. 在 `ps aux`（Unix）或 `tasklist`（Windows）中检查 `--team-name` 与已清理 team 匹配的 OMC worker 进程
2. 发送 SIGTERM，等待 5 秒，若仍存活则发送 SIGKILL
3. 以 JSON 报告清理结果

使用 `--dry-run` 可只检查而不杀进程。该扫描器可安全重复运行。

**结构化取消报告：**
```
Team "{team_name}" 已取消：
  - 已通知成员：N
  - 已收到响应：M
  - 无响应：K（如有则列出名称）
  - OMC 状态已清除：是/否
  - 需要手动清理：是/否
    路径：OMC team 状态 / tmux worker 进程（如有）
```

**实现说明：** cancel 技能由 LLM 执行，而非作为 bash 脚本。当你检测到活动的 team 时：
1. 读取 `state_read(mode="team")` 以找到活动的 OMC team
2. 从状态、handoffs 或任务记录中识别出活动的具名队友
3. 对每个队友，通过活动的对话/team 消息通道询问或通知指定名称的队友
4. 短暂等待关闭响应（每个成员超时 15 秒）
5. 在对账等待之后记录无响应的队友
6. 清除 team 状态：`state_clear(mode="team", session_id)`
7. 向用户报告结构化摘要

#### 如果 Autopilot 处于活动状态

Autopilot 处理自己的"主项优先"清理：命名工作流在清理关联的 ralph 和 ultraqa **之前**，额外只移除其会话自有的嵌套 ralplan 强制状态。

1. 通过 `state_read(mode="autopilot", session_id)` 读取 autopilot 状态，捕获确切的当前运行，包括存在时的 `workflowRunId`。
2. 用窄变更 `state_write(mode="autopilot", session_id, active=false, state={workflowRunId: "<exact run id>"})` 暂停该确切的运行。**不要**重放或复制状态回读。在带 `flock` 的 Linux 上，该工具会在其变更锁下重新校验所持有的运行和工作流完整性，然后才只把 `active` 改为 `false`；它保留工作流、流水线跟踪和任务标识。`target_state_sha256` 仅在其为当前序列化状态的确切 SHA-256 时才可包含。
   - 如果此写入失败，立即停止。不要清除嵌套的 ralplan、关联状态、取消信号或运行时工件。
3. 对于命名工作流，只清除同一 `session_id` 拥有的 `ralplan` 状态；绝不清除其他会话的独立 ralplan 状态。记录失败但保持已暂停的主项可恢复。
4. 只有在主项暂停提交之后，才通过 `state_read(mode="ralph", session_id)` 检查关联的 ralph：
   - 如果 ralph 处于活动状态且具有 `linked_ultrawork: true`，先清除 ultrawork 并要求成功。
   - 清除 ralph 并要求成功。
5. 通过 `state_read(mode="ultraqa", session_id)` 检查关联的 ultraqa，如果处于活动状态则清除它。
6. 明确报告每一个依赖项清除失败；已暂停的 autopilot 状态仍可恢复，清理可以重试。

强制取消对每个 autopilot 组遵循相同的主项优先规则：先清除确切的主项 autopilot，如果主项清除失败则中止其依赖项清理，绝不假装该组已成功而继续执行。

#### 如果 Ralph 处于活动状态（但非 Autopilot）

1. 通过 `state_read(mode="ralph", session_id)` 读取 ralph 状态，以检查是否有关联的 ultrawork
2. 如果 `linked_ultrawork: true`：
   - 读取 ultrawork 状态以验证 `linked_to_ralph: true`
   - 如果已关联，则清除 ultrawork：`state_clear(mode="ultrawork", session_id)`
3. 清除 ralph：`state_clear(mode="ralph", session_id)`

#### 如果 Ultrawork 处于活动状态（独立，未关联）

1. 通过 `state_read(mode="ultrawork", session_id)` 读取 ultrawork 状态
2. 如果 `linked_to_ralph: true`，提醒用户改为取消 ralph（会级联清理）
3. 否则清除：`state_clear(mode="ultrawork", session_id)`

#### 如果 UltraQA 处于活动状态（独立）

直接清除：`state_clear(mode="ultraqa", session_id)`

#### 无活动模式

报告："未检测到活动的 OMC 模式。仍可使用 --force 清除所有状态文件。"

## 实现说明

cancel 技能按如下方式运行：
1. 解析 `--force` / `--all` 标志，判断清理范围应覆盖每个会话，还是限定在当前 session id 内。
2. 用 `state_list_active` 枚举已知 session id，并用 `state_get_status` 得知每个会话的活动模式（`autopilot`、`ralph`、`ultrawork` 等）。
3. 在默认模式下运行时，带上该 session_id 调用 `state_clear` 只移除该会话的文件，然后依据状态工具的信号运行模式专属清理（autopilot → ralph → …）。
4. 在强制模式下，遍历每个活动会话，对每个会话调用 `state_clear`，然后运行不带 `session_id` 的全局 `state_clear` 以删除旧文件（`.omc/state/*.json`、兼容性工件）并报告成功。Swarm 仍是会话作用域之外的共享 SQLite/标记文件模式。
5. Team 工件（`~/.claude/teams/*/`、`~/.claude/tasks/*/`、`.omc/state/team-state.json`）仍是在旧版/全局清理阶段尽力执行的清理项。
6. **始终**把清除 skill-active 状态作为最后一步，无论当时是哪个模式处于活动状态、也无论是否使用了 `--force`：
   ```
   state_clear(mode="skill-active", session_id)
   ```
   这确保 stop hook 不会因为过期的 `skill-active-state.json` 而在 cancel 之后继续反复触发技能保护强化。参见 issue #2118。

状态工具始终遵循 `session_id` 参数，因此即使是强制模式，也会先清除会话作用域的路径，然后才删除仅用于兼容性的旧状态。

下面的模式专属小节描述每个处理器在全状态操作完成后所执行的额外清理。
## 消息参考

| 模式 | 成功消息 |
|------|-----------------|
| Autopilot | "Autopilot 已在阶段 {phase} 取消。进度已保留，可恢复。" |
| Ralph | "Ralph 已取消。持久化模式已停用。" |
| Ultrawork | "Ultrawork 已取消。并行执行模式已停用。" |
| UltraQA | "UltraQA 已取消。QA 循环工作流已停止。" |
| Swarm | "Swarm 已取消。协调的代理已停止。" |
| Ultrapilot | "Ultrapilot 已取消。并行 autopilot worker 已停止。" |
| Pipeline | "Pipeline 已取消。顺序代理链已停止。" |
| Team | "Team 已取消。队友已关闭并清理完毕。" |
| Plan Consensus | "Plan Consensus 已取消。规划会话已结束。" |
| Force | "所有 OMC 模式已清除。你可以自由地重新开始。" |
| None | "未检测到活动的 OMC 模式。" |

## 保留的内容

| 模式 | 保留的状态 | 恢复命令 |
|------|-----------------|----------------|
| Autopilot | 是（阶段、文件、规格、计划、裁决） | `/oh-my-claudecode:autopilot` |
| Ralph | 否 | 不适用 |
| Ultrawork | 否 | 不适用 |
| UltraQA | 否 | 不适用 |
| Swarm | 否 | 不适用 |
| Ultrapilot | 否 | 不适用 |
| Pipeline | 否 | 不适用 |
| Plan Consensus | 是（保留计划文件路径） | 不适用 |

## 说明

- **依赖感知**：取消 Autopilot 会清理 Ralph 和 UltraQA
- **关联感知**：取消 Ralph 会清理关联的 Ultrawork
- **安全**：只清理关联的 Ultrawork，保留独立的 Ultrawork
- **仅本地**：只清除 `.omc/state/` 目录中的状态文件
- **便于恢复**：保留 Autopilot 状态以实现无缝恢复
- **Team 感知**：检测原生 Claude Code team 并执行优雅关闭

## MCP Worker 清理

当取消可能衍生出 MCP worker（team bridge 守护进程）的模式时，cancel 技能还应：

1. **检查活动的 MCP worker**：在 `.omc/state/team-bridge/{team}/*.heartbeat.json` 查找心跳文件
2. **发送关闭信号**：为每个活动 worker 写入关闭信号文件
3. **杀掉 tmux 会话**：对每个 worker 运行 `tmux kill-session -t omc-team-{team}-{worker}`
4. **清理心跳文件**：移除该 team 的所有心跳文件
5. **清理影子注册表**：移除 `.omc/state/team-mcp-workers.json`

### 强制清除附加项

使用 `--force` 时，还清理：
```bash
rm -rf .omc/state/team-bridge/       # 心跳文件
rm -f .omc/state/team-mcp-workers.json  # 影子注册表
# 杀掉所有 omc-team-* tmux 会话
tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^omc-team-' | while read s; do tmux kill-session -t "$s" 2>/dev/null; done
```
