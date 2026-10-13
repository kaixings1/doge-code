# 本地模式 agent 能力对标与吸收计划

> 日期：2026-10-10。方法与 `mobile-feature-benchmark.md` 一致：
> 先建基准 → 逐项对照代码事实 → 分档排期。
>
> **基准来源与远端对标不同**：远端模式的基准是「同类产品」（Claude 官方
> 移动端、Termius、happy 等）；本地模式的基准是**本仓库自己的 CLI**
>（`src/tools/` 70+ 个工具）—— 它是完整成熟的 agent 实现，而本地模式
> 只有 4 个工具。「吸收」= 把 CLI 中**不依赖 shell/进程**的能力
> 移植到 Android 侧的 `LocalTools` / `AgentLoop`。

## 一、现状：本地 agent 只有 4 个工具

```
LocalTools（408 行）: read_file / write_file(整写) / list_dir / search_in_files(子串)
AgentLoop（181 行）:  单线程循环，25 轮上限
SystemPrompt（83 行）: 显式声明「不能执行命令」等边界
```

对照 CLI（`src/tools/` 70+ 工具），本地模式缺失的能力分四档：

## 二、缺口分档

### A 档 · 工具面（最影响「能干什么」）

| # | 能力 | CLI 参照 | 本地模式现状 | 为什么重要 |
|---|---|---|---|---|
| A1 | **文件编辑**（old/new 精确替换） | `FileEditTool` | ❌ 只有 `write_file` 整文件覆盖 | **当前最大安全缺陷**：模型改一行也要重发整个文件。大文件下（1）token 浪费严重（2）模型凭记忆重写会**丢内容**——它读过 500 行限制内的内容，覆盖写入时可能漏掉后面的 |
| A2 | **任务清单**（todo） | `TodoWriteTool` | ❌ | 多步任务（「重构这三个文件」）时模型靠对话历史记进度，长任务会「忘记做到哪」；用户也看不到进度 |
| A3 | **Glob 文件查找** | `GlobTool` | ❌ 只能 list_dir 逐层翻 | 「找所有 .kt 文件」要模型手工递归 list_dir 多轮，浪费轮数与 token |
| A4 | **正则搜索** | `GrepTool` | ❌ 只有子串 search_in_files | CLI 的搜索是 ripgrep 级正则；本地连「找 TODO|FIXME」都做不到 |

### B 档 · 循环健壮性（最影响「靠不靠谱」）

| # | 能力 | CLI 参照 | 现状 | 为什么 |
|---|---|---|---|---|
| B1 | **并行工具调用** | query.ts 每轮可发多个 tool_use 并发执行 | ✅ 多 tool_calls 顺序执行 | 不并发是**正确**的（Android 文件 IO + 无冲突顾虑小），但「同轮多个 read」串行会慢。**不吸收**：串行更稳，收益小 |
| B2 | **上下文压缩** | `ContextCollapse` + queryLoop 自动 compact | ❌ 历史超长直接发全量 | 长会话下每轮请求体线性膨胀 → 费用 & 超限。CLI 的做法是保留首尾、压缩中间 |
| B3 | **工具结果截断** | `collapseReadSearch` | ◐ 已有单次上限 | 累计上限已做（M 系列），单轮不截断。**低危，暂不动** |
| B4 | **停止后可恢复** | interrupt + resume | ❌ 中断即丢本轮 | 现状可接受（已产出内容不丢） |

### C 档 · 体验

| # | 能力 | 现状 | 判定 |
|---|---|---|---|
| C1 | 工具气泡耗时显示 | ✅ 已有 | — |
| C2 | 用量统计 | ❌ 无 usage 解析 | **吸收**：`/cost` 本地版（SSE 里有 usage 字段，现被丢弃） |
| C3 | 图片输入 | ✅ 远端已支持，本地未接 | 模型支持与否取决于 provider，**接了才有机会用**。中优先 |

### D 档 · 明确不吸收（与远端「明确不做」同源）

| 项 | 不做理由 |
|---|---|
| Bash / 命令执行 | Android 沙箱无 shell（已在 SystemPrompt 声明） |
| Git 工具 | 需要 git 二进制 |
| 子 agent | 手机内存/电量/费用三重约束，CLI 的多 agent 并发不适合 |
| MCP / WebSearch / WebFetch | 本地模式定位是「离线文件助手」；网络工具会打破该定位（SystemPrompt 已声明「没有网络访问」） |
| Plan mode / 权限审批 | 本地模式工具只碰工作区（WorkspacePath 已是安全边界），无需审批 |

## 三、吸收批次

| 批 | 内容 | 对应 | 依赖 |
|---|---|---|---|
| **L1** | A1 文件编辑（Edit 工具） | FileEditTool | — |
| **L2** | A2 任务清单 + C2 用量统计 | TodoWrite + cost | — |
| **L3** | A3 Glob + A4 正则搜索 | GlobTool + GrepTool | — |
| **L4** | B2 上下文压缩 | ContextCollapse | L1-L3 后（工具多了历史才膨胀得快） |

每批独立可交付：加工具 → 系统 prompt 更新 → 测试 → 变异验证 → APK。

## 四、吸收时的移植准则

1. **能力对齐 CLI 的语义，但实现从零写**——CLI 的工具是 TS + 进程环境
   （ripgrep 二进制、child_process），Android 侧只能用 java.io.File + Kotlin
   Regex。吸收的是**接口语义**（参数形状、错误信息、返回格式），不是代码。
2. **错误信息保持「面向模型可自救」**：CLI 工具报错会说「old_string 不唯一，
   请包含更多上下文」—— 模型据此自己修正重试。照抄这类文案设计。
3. **每个新工具立即进 SystemPrompt 的 TOOLS_DESC**（且有测试锁定
   「提示词与 specs() 一致」，防漂移）。
4. **上限常量与既有 LocalTools 同源**（MAX_READ_BYTES 等），不另起一套。

## 五、实施对照表

| 批 | 状态 | 验证 |
|---|---|---|
| L1 文件编辑 | ✅ 完成 | 14 条新测试；2 处变异捕获；945/945；APK 成功 |
| L2 任务清单 + 用量 | ✅ 完成 | 16 条新测试；3 处变异捕获；964/964；APK 成功 |
| L3 Glob + 正则搜索 | ✅ 完成 | 17 条新测试；2 处变异捕获；981/981；APK 成功 |
| L4 上下文压缩 | ⬜ | — |

### L3 实施记录（2026-10-10）

**改动**
- 新增 `GlobPattern`（纯函数 object）：glob → 正则转换。
  关键语义：`*` → `[^/]*`（**不跨目录**）、`**` → `.*`（跨目录，
  `a/**/b` 也匹配 `a/b`）、`?` → `[^/]`、其余字符按字面量转义。
  **不能把 glob 当正则直接用** —— 正则的 `*` 没有「不跨目录」限制。
- `LocalTools` 新增 `glob` 工具：递归遍历 + 模式匹配，复用 `SKIP_DIRS`
  （依赖/构建产物不进结果），深度与数量上限与 search 同源。
- `search_in_files` 加 `regex` 参数（默认 false 保持纯文本，向后兼容）。
  **非法正则立即报错**而非静默回退子串 —— 模型以为在搜正则，静默回退
  会让它拿到错误的「未找到」结论。
- `SystemPrompt` 同步（且有双向契约测试）。

**测试**：`GlobAndRegexTest` 17 条
- GlobPattern：`*` 不跨目录 / `**` 跨目录 / `a/**/b` 匹配 `a/b` / `?` /
  特殊字符字面量 / 全匹配语义
- glob 工具：真实文件系统、跳过 node_modules、无匹配、缺参数
- 正则：默认纯文本（含正则元字符的文本也要命中）、`|` 多选、字符类、
  非法正则报错

**变异验证（2/2 捕获）**
| 注入缺陷 | 失败用例 |
|---|---|
| `*` 改成 `.*`（跨目录） | 2 条（纯函数 + 工具层各一条） |
| 非法正则静默回退子串 | 1 条 |

### L2 实施记录（2026-10-10）

**改动**
- `LocalTools` 新增 `todo` 工具：整表替换式清单（吸收自 CLI TodoWrite 的
  「覆盖而非增删」设计 —— 增删式需要 id 对齐，模型极易弄错）。
  校验：status 只认三值、in_progress 最多一个（CLI 同款规则）、content 非空、
  上限 20 条。`synchronized` 保护（worker 线程写、任意线程读）。
- `LocalTools.currentTodoContext()`：渲染为 `✓/▶/空格` 清单。
  `AgentLoop.run` 每轮注入为 user 消息**前**的一条 system 短消息
  （动态状态当「当前状态」而非「背景设定」；空清单不注入省 token）。
- `SseParser` 解析 `usage`：**必须在「choices 取不到」的早退之前吸收** ——
  OpenAI 兼容流的收尾帧 choices 为空数组、usage 在顶层，放早退之后
  永远读不到（此处变异验证专门锁定）。
- `ChatUsage` 数据类 + `ChatResult.usage`（可空，服务端没给时 UI 显示「—」）。
- `AgentLoop` 各轮 usage 累计进 `RunResult.usage`（DONE/MAX_STEPS/INTERRUPTED
  三条退出路径都带）。
- `LocalAgentBackend.sessionUsage()/resetUsage()`：跨回合累计
  （`/cost` 是会话级统计，与 CLI 语义一致）。
- `/cost` 从 REMOTE 改 BOTH：本地分支显示累计 input/output/total tokens。
- 清空对话时一并 `resetUsage()` + `clearTodos()`（新会话新计划）。

**测试**：`LocalTodoUsageTest` 16 条（todo 的状态机/校验/上下文渲染、
usage 的收尾帧/普通帧/缺失/多次覆盖、AgentLoop 的逐轮累计/注入/不注入）

**变异验证（3/3 捕获）**
| 注入缺陷 | 失败用例 |
|---|---|
| usage 移到 choice 早退之后 | 2 条（收尾帧解析 + 多次覆盖） |
| 不数 in_progress | 1 条 |
| AgentLoop 不注入 todo 上下文 | 1 条 |

### L1 实施记录（2026-10-10）

**改动**
- `LocalTools.edit_file`：old_string→new_string 精确替换。语义吸收自 CLI
  `FileEditTool`（errorCode 6/8/9 对应的守卫与文案），实现从零写。
- **读状态跟踪**（`readTracker` 内存 Map）：edit 前必须 read_file —— 把
  「看清楚再改」从提示词期望变成机制。进程重启清空（新会话应重新确认现状）。
- **CRLF 归一化**：匹配前统一换行，否则 Windows 换行文件里 LF 的
  old_string 永远匹配不上（模型会反复重试浪费轮次）。
- **多匹配校验**：`matches > 1 && !replace_all` 拒绝，错误信息给出两条
  自救路径（设 replace_all / 加上下文）—— 照抄 CLI 的文案设计。
- `SystemPrompt`：TOOLS_DESC 加 edit_file，工作方式改「优先 edit 而非 write」。
- `write_file` 描述也改：提醒局部修改优先 edit。

**有意不吸收的两点**（记录理由）
- CLI 的 errorCode 7「读后被外部修改」校验：需存内容快照，手机上没有
  linter/云同步这类并发修改源，不值得。升级路径：存 mtime（已注释标记）。
- CLI 的引号归一化（curly quotes）：模型与文件都走同一 UTF-8 通道，
  无编码歧义源。

**测试**：`LocalToolsTest` 扩充 14 条（含 CRLF、连续编辑、双向契约
「specs 加了 → SystemPrompt 必须同步」）

**变异验证（2/2 捕获）**
| 注入缺陷 | 失败用例 |
|---|---|
| 去掉「先读后改」校验 | `未读过的文件拒绝编辑` |
| 忽略多匹配校验（`&& false`） | `多匹配无 replace_all 时拒绝` |

**第三处变异不可达的分析**（重要）：
`replaceFirst` ↔ `replace` 的差异只在「多处匹配」时存在，而多匹配已被
`matches > 1 && !replace_all` 守卫拦截 —— **计数=1 时两者恒等**。
该变异被上层守卫结构性消灭，属守卫正确的证据而非测试盲区。
