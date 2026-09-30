---
name: gsd:graphify
description: "构建、查询和检查 .planning/graphs/ 中的项目知识图谱。"
argument-hint: "[build|query <term>|status|diff]"
allowed-tools:
  - Read
  - Bash
requires: [config, fast, phase, update]
---

**停止——不要读取此文件。你已经在读取它。此提示由 Claude Code 的命令系统注入到你的上下文中。在此文件上使用 Read 工具会浪费令牌。立即开始执行步骤 0。**

**仅 CJS (graphify)：** `graphify` 子命令未在 `gsd-sdk query` 上注册。使用 `node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs graphify …`，如此命令和 `docs/CLI-TOOLS.md` 中所述。其他工具可能仍在使用存在处理程序的 `gsd-sdk query`。

## 第 0 步 —— 横幅

**在任何工具调用之前**，显示此横幅：

```
GSD > GRAPHIFY
```

然后继续到第 1 步。

## 第 1 步 —— 配置门禁

通过使用 Read 工具直接读取 `.planning/config.json` 检查 graphify 是否启用。

**不要使用 gsd-tools config get-value 命令** —— 它在键缺失时会硬退出。

1. 使用 Read 工具读取 `.planning/config.json`
2. 如果文件不存在：显示下面的禁用消息并**停止**
3. 解析 JSON 内容。检查 `config.graphify && config.graphify.enabled === true`
4. 如果 `graphify.enabled` **未**显式为 `true`：显示下面的禁用消息并**停止**
5. 如果 `graphify.enabled` 为 `true`：继续到第 2 步

**禁用消息：**

```
GSD > GRAPHIFY

Knowledge graph is disabled. To activate:

  node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs config-set graphify.enabled true

Then run /gsd:graphify build to create the initial graph.
```

---

## 第 2 步 —— 解析参数

解析 `$ARGUMENTS` 以确定操作模式：

| 参数 | 动作 |
|----------|--------|
| `build` | 运行内联构建（第 3 步） |
| `query <term>` | 运行内联查询（第 2a 步） |
| `status` | 运行内联状态检查（第 2b 步） |
| `diff` | 运行内联 diff 检查（第 2c 步） |
| 无参数或未知 | 显示用法消息 |

**用法消息**（在无参数或无法识别的参数时显示）：

```
GSD > GRAPHIFY

Usage: /gsd:graphify <mode>

Modes:
  build           Build or rebuild the knowledge graph
  query <term>    Search the graph for a term
  status          Show graph freshness and statistics
  diff            Show changes since last build
```

### 第 2a 步 —— 查询

运行：

```bash
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs graphify query <term>
```

解析 JSON 输出并显示结果：
- 如果输出包含 `"disabled": true`，显示第 1 步的禁用消息并**停止**
- 如果输出包含 `"error"` 字段，显示错误消息并**停止**
- 如果未找到节点，显示：`No graph matches for '<term>'. Try /gsd:graphify build to create or rebuild the graph.`
- 否则，按类型分组显示匹配的节点，带边关系和置信度层级（EXTRACTED/INFERRED/AMBIGUOUS）

显示结果后**停止**。不要生成代理。

### 第 2b 步 —— 状态

运行：

```bash
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs graphify status
```

解析 JSON 输出并显示：
- 如果 `exists: false`，显示 message 字段
- 否则显示上次构建时间、节点/边/超边计数，以及 STALE 或 FRESH 指标
- 如果 `built_at_commit` 非 null，同时显示 `Source commit:` 行：
  - `commit_stale === false`（在 HEAD 重建）：`Source commit: <built_at_commit> (current)`
  - `commit_stale === true`（图谱落后于 HEAD）：`Source commit: <built_at_commit> (<commits_behind> commits behind HEAD)`
  - `commit_stale === null`（不可达提交/无 git）：`Source commit: <built_at_commit> (freshness unknown)`
- 如果 `built_at_commit` 为 null（graphify-v0.7 之前的图谱），完全省略 source-commit 行——不要渲染 "Source commit: unknown"

基于 mtime 的 STALE/FRESH 标志和基于提交的 `commit_stale` 测量
不同的东西，可能不一致（例如，几分钟前针对旧 checkout 重建的 CI 构建图谱
在 mtime 上读为 FRESH 但 `commit_stale: true`）。
两者都呈现，以便代理可以选择。

显示状态后**停止**。不要生成代理。

### 第 2c 步 —— Diff

运行：

```bash
node $HOME/.claude/get-shit-done/bin/gsd-tools.cjs graphify diff
```

解析 JSON 输出并显示：
- 如果 `no_baseline: true`，显示 message 字段
- 否则显示节点和边变更计数（添加/删除/更改）

如果不存在快照，建议运行 `build` 两次（第一次创建，第二次生成 diff 基线）。

显示 diff 后**停止**。不要生成代理。

---

## 第 3 步 —— 构建（内联）

首先运行预检：

```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify build
```

解析 JSON 输出：
- 如果 `disabled: true`：显示第 1 步的禁用消息并**停止**
- 如果 `error`：显示错误消息并**停止**
- 如果 `action: "spawn_agent"`：预检通过——继续下面的内联构建

（`spawn_agent` 动作名称是历史遗留。该技能现在内联执行构建，因为 graphify v0.7+ 将构建拆分为快速的 AST 提取阶段和单独的聚类 + 报告写入阶段。子代理隔离保持了缓存的提取阶段存活，但在代理退出时对提取后阶段发送 SIGTERM，使缓存被填充但没有写入 `graph.json` 产物。CLI 仍发出 `spawn_agent` 信号，以便外部调用者和测试继续工作。）

显示：

```text
GSD > Building knowledge graph...
```

在单个前台 Bash 调用中运行构建、复制产物、写入 diff 快照并报告摘要，以便整个流水线存活到完成。使用 `600000` ms（10 分钟）的 `timeout`，它覆盖 `graphify.build_timeout` 上限（默认 300 秒）并留有余量：

```bash
graphify update . \
  && cp graphify-out/graph.json .planning/graphs/graph.json \
  && cp graphify-out/graph.html .planning/graphs/graph.html \
  && cp graphify-out/GRAPH_REPORT.md .planning/graphs/GRAPH_REPORT.md \
  && node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify build snapshot \
  && node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify status
```

**不要**传递 `run_in_background: true`。典型构建在 15-60 秒内完成，整个链必须在前台运行。

如果链失败（非零退出）：
- 显示：`## GRAPHIFY BUILD FAILED` 后跟捕获的 stderr
- **不要**删除 `.planning/graphs/` —— 先前有效的图谱仍然可用
- **停止**

如果链成功：
- 解析末尾的 `graphify status` JSON
- 显示：`## GRAPHIFY BUILD COMPLETE` 及节点、边和超边计数

---

## MVP 模式节点渲染

**MVP 模式渲染。** 当一个阶段在 ROADMAP.md 中有 `**Mode:** mvp` 时（通过 `gsd-sdk query roadmap.get-phase --pick mode` 解析），用两个不同的视觉信号渲染其图谱节点：

1. **不同的填充色。** 对 MVP 模式阶段节点使用 `#22c55e`（绿色）。标准阶段保持默认填充色。双通道信号（颜色 + 标签）处理色盲和灰度渲染。
2. **`MVP` 标签后缀。** 在节点的标签文本后追加 ` (MVP)`。示例：原本标记为 `Phase 1: User Auth` 的阶段渲染为 `Phase 1: User Auth (MVP)`。

两个信号同时触发——绝不要只用一个。根据 PRD Q5 决策，目标是在任何渲染上下文中都能无歧义地区分。

当阶段模式为 null/缺失时，用标准颜色和标签渲染——非 MVP 阶段无行为变化。

---

## 反模式

1. **不要**为任何操作生成代理——构建、查询、状态和 diff 都内联运行。子代理隔离在代理退出时终止后台 bash，此前会截断 graphify 构建的写入中途，只留下被填充的缓存（#3166）。
2. **不要**为构建链传递 `run_in_background: true` —— 操作很快且必须在前台完成。
3. **不要**直接修改图谱文件——始终通过 `graphify update .` 和快照 CLI。
4. **不要**跳过配置门禁检查。
5. **不要**为配置门禁使用 `gsd-tools config get-value` —— 它在键缺失时退出。
