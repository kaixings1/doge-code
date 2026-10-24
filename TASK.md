# TASK.md — doge-code 任务追踪

> 项目架构见 `PLANNING.md`（若不存在则以 `diff_with_claude.md` 为对照基线）。
> 本文件只记录**待办与状态**，不重复设计文档。

---

## 一、官方功能对齐：#21 2026-04-01 之后官方 Claude Code 功能缺口

**检查日期**：2026-10-22
**基线**：官方 `@anthropic-ai/claude-code` 2.1.90（2026-04-01）→ 2.1.306（2026-10-21）
**方法**：官方 CHANGELOG.md（2.1.91→2.1.306，426 个版本节 / 6093 条变更）+ 本地 `src/` 全量标识符扫描（3349 文件）
**原始数据**：`.tmp/off/changelog_after_90.md`、`missing_env.txt`、`missing_flags.txt`、`missing_slash.txt`

### 0. 适用性前提（决定补什么）

**本 fork 的实际使用场景**：通过 `openaiCompat.ts` / `providerCompat.ts` 接入国内模型（DeepSeek 预设见 `src/constants/presets.ts:27-37`，含 `deepseek-chat` / `deepseek-v4-pro` 等），BaseURL 指向 `api.deepseek.com`。

**判定原则**：
- 只补**与模型供应商无关**的能力（重试、安全阀门、技能生态、CLI 参数）。
- 官方专为 Anthropic 云/新模型设计的能力**不补**。
- 每项补之前先确认：本地是否已有等价实现（避免重复造轮子）。

---

### 1.1 结论摘要（按适用性重新分级）

| 组 | 缺口 | 对 DeepSeek 用户 | 处置 |
|---|---|---|---|
| A | 7 个 Anthropic 新模型（opus/sonnet/haiku/fable 5.x） | **无价值** | ❌ 放弃 |
| B | 重试看门狗体系 | **有价值**（429 限流同样适用） | ✅ 部分补，已有基础 |
| C | OpenTelemetry 遥测 | 无价值（企业可观测性） | ❌ 不跟 |
| D | 技能/命令生态 | **有价值** | ✅ 选择性补 |
| E | 安全阀门 / 工具能力 | **有价值** | ✅ 全部补 |

---

### 1.2 ❌ A 组：Anthropic 新模型 —— 放弃

用户使用 DeepSeek（`api.deepseek.com`），官方 2.1.90 后新增的 `claude-opus-5-5` / `claude-sonnet-5-5` / `claude-haiku-5-5` / `claude-fable-5(-1)` / `claude-opus-5` / `claude-sonnet-5` **全部不接入**。

**不做的事**（明确记录，避免后人误当成遗漏）：
- 不补模型 ID、别名（`fable`/`best`）、1M 上下文能力判定、fast mode 分支
- 不补这些模型的定价分支

**唯一保留**：若将来接 Anthropic 官方 API，再按本节补。当前作废。

---

### 1.3 ✅ B 组：重试 / 限流退避（有价值，但本地已有基础）

**现状核查**（`src/services/api/withRetry.ts`）：

| 本地已有 | 说明 |
|---|---|
| `CLAUDE_CODE_MAX_RETRIES` | 最大重试次数，默认 15，上限 15（v2.1.186 对齐） |
| `BASE_DELAY_MS = 20_000` | 基础退避延迟 |
| `getRetryDelay()` | 2x 指数退避 + 25% jitter，尊重 `retry-after` |
| `CLAUDE_CODE_UNATTENDED_RETRY` | 无人值守模式（ant-only 门控，重试 429/529） |

**结论**：本地已有完整的 429 退避能力，**不需要**从零实现官方 `CLAUDE_CODE_RETRY_WATCHDOG`。仅补官方新增的两个**独立参数化**能力（对 DeepSeek 429 限流有直接价值）：

- [x] **B1. `CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS` —— 已完成（2026-10-22）**
      - `withRetry.ts`：新增 `getOverloadedRetryBaseDelayMs()`；退避分支改为
        `is529Error(error) ? getOverloadedRetryBaseDelayMs() : BASE_DELAY_MS`。
      - 语义：未设置/非法值（NaN、0、负数）回落到 `BASE_DELAY_MS`(20s)，**行为与之前完全一致**。
      - 价值：DeepSeek 等国内供应商高峰期过载时，可调大初始等待避免连环撞限流，或调小快速恢复。

- [x] **B2. `CLAUDE_CODE_NONSTREAMING_TIMEOUT_RETRIES` —— 已完成（2026-10-22）**
      - `withRetry.ts`：`RetryOptions` 新增 `isNonStreamingFallback`；新增
        `getNonStreamingTimeoutRetries()`；超时分支内计数并在超限时 `throw CannotRetryError`。
      - `claude.ts`：`executeNonStreamingRequest` 调用 `withRetry` 时传入 `isNonStreamingFallback: true`。
      - 语义：未设置/非法值返回 `null`（不额外限制，仍受全局 `maxRetries` 约束）；
        **允许 0**（显式表示超时后不再重发）。只有标记为非流式回退时才生效。

- 测试：`tests/unit/retry-config-flags.test.ts`（11 用例）——两参数的取值语义各 3–4 例，
  外加 4 条**源码契约**断言（529 分支用可配置基数、超时分支检查上限、仅
  `isNonStreamingFallback` 才启用、调用点确实传了标志）。
- 变异验证：① B1 忽略环境变量恒返回默认 → 1 例失败；② B2 未设值当成 0 → 2 例失败；
  ③ B2 上限判定永不触发 → 1 例失败。均已捕获。
- **测试环境踩坑**：`withRetry.js` 首次 import 在 vitest 下要 10s+（`claude.ts`/analytics 等
  重依赖），前两个用例超时。改为 `beforeAll` 预热并缓存模块实例，全部用例降到 0–1ms
  （总时长仍 17s，是模块加载的一次性成本）。
- 回归：`tsc` 两文件 0 错误；diff +61/−2。

**不补**（Anthropic 云配额专属，DeepSeek 无对应语义）：
`CLAUDE_CODE_RETRY_WATCHDOG` 及其 4 个子参数
（`CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` / `..._MAX_USAGE_LIMIT_WAIT_MS` / `..._USAGE_LIMIT_RECHECK_MS` 等，
它们针对 Anthropic 的 5 小时用量周期与 plan 限额）。

**验收**：模拟 503 + 429 序列，确认 B1/B2 参数生效；`CLAUDE_CODE_MAX_RETRIES` 行为不变。

---

### 1.4 ❌ C 组：OpenTelemetry —— 不跟

9 个 `OTEL_*` 环境变量（`OTEL_LOG_TOOL_DETAILS`、`OTEL_LOG_TOOL_CONTENT`、`OTEL_LOG_ASSISTANT_RESPONSES`、`OTEL_LOG_USER_PROMPTS`、`OTEL_LOG_RAW_API_BODIES`、`OTEL_LOG_MANAGED_SETTINGS`、`OTEL_METRICS_INCLUDE_REPOSITORY`、`OTEL_METRICS_INCLUDE_ENTRYPOINT`、`OTEL_LOGRECORD_ATTRIBUTE_COUNT_LIMIT`）为企业可观测性体系，与本 fork「零依赖、离线可用」目标冲突。

**处置**：不实现，不作为工程债务。

---

### 1.5 ✅ D 组：技能 / 命令生态（选择性补）

| 命令 | 版本 | 价值判断 | 处置 |
|---|---|---|---|
| `/reload-skills` | 2.1.304 | 压缩后找回技能，**与模型无关** | ✅ 补 |
| `/skill-doctor` | 2.1.261 | 列出未使用技能及其上下文成本，**省 token 直接省钱** | ✅ 补 |
| `/dataviz` | 2.1.198 | 纯技能内容（图表设计 + 配色验证器），无模型依赖 | ✅ 补 |
| `/auto-mode-setup` | 2.1.304 | 学习项目环境配置 auto mode，与模型无关 | ⚠️ 可选（P2） |
| `/checkup`（`/doctor prompt-audit`） | 2.1.283 | CLAUDE.md/技能提示词审计，与模型无关 | ⚠️ 可选（P2） |
| `/design-sync`、`/design-login` | 2.1.302 | 官方已宣布 2026-12-14 关闭 | ❌ 跳过 |
| `/setup-bedrock`、`/setup-vertex` | 2.1.281 | AWS/GCP 云平台专属，DeepSeek 用户用不到 | ❌ 跳过 |
| `/readyz` | 2.1.282 | 企业 gateway 健康检查 | ❌ 跳过 |

**修复计划**：
- [x] **D1. `/reload-skills` —— 已完成（2026-10-22）**
      - 新建 `src/commands/reload-skills/index.ts`（`local` 型命令），`commands.ts` 注册。
      - 语义（官方 v2.1.304）：重新扫描技能目录，并把**完整技能列表**重新告知模型
        （不是增量重发——压缩后需要全部技能回来）。
      - 执行序列复用 `skillChangeDetector.ts:277-280` 已验证的做法：
        `clearSkillCaches()` → `clearCommandsCache()` → `resetSentSkillNames()`。
      - 输出含重载前后数量对比与新增/移除清单，便于用户核对。

- [x] **D2. `/skill-doctor` —— 已完成（2026-10-22）**
      - 新建 `src/commands/skill-doctor/index.ts`（`local` 型命令），`commands.ts` 注册。
      - 语义（官方 v2.1.261）：列出**本会话从未被调用**的技能及其上下文 token 成本。
      - 实现：从 `context.messages` 扫描 assistant 消息里的 `tool_use` 块，按 `input.skill`
        收集本会话用过的技能名；与 `getSkillToolCommands()` 做差集；成本用既有
        `estimateSkillFrontmatterTokens()`（与系统提示注入同口径）。
      - 输出：已加载/已使用数量、总成本、未使用技能按 token 降序列表。

- 测试：`tests/unit/skills-reload-doctor.test.ts`（8 用例）——注册与唯一性 3 例、
  `/reload-skills` 真实调用三个清理入口 2 例、`/skill-doctor` 区分使用/未使用 3 例。
- 变异验证：① 去掉 `resetSentSkillNames()` 调用 → 1 例失败；② `unused = skills`（忽略使用记录）
  → 2 例失败。均已捕获。
- 回归：命令唯一性 5/5 通过；`tsc` 两命令文件 0 错误。
- **踩坑记录**：首次变异把**注释里**的 `resetSentSkillNames()` 当成真实调用替换，
  导致变异未生效、测试仍全绿。改为按行匹配（`l.trim() === 'resetSentSkillNames()'`）
  并回读确认行号后才真正捕获。这是同类错误第二次出现，务必坚持「变异后回读确认」。
- **注意**：`src/commands.ts` 工作区存在其它并发会话的未提交改动（`feishu`、`ultraplanLocal`、
  `router`、`vault` 等），本次只新增自己需要的 2 行 import + 2 行注册，未触碰他人改动。
- 未做：TUI 实跑验证（需重新构建）。
- [x] **D3. `/dataviz` —— 已完成（2026-10-22）**
      - 新建 `src/skills/bundled/dataviz.ts`，在 `bundled/index.ts` 注册。
      - 提示词覆盖五部分：先选图形（含"饼图 ≤5 片""柱状图绝不截断 Y 轴"等硬规则）、
        颜色（定性/连续/发散色板用法、不能只靠颜色编码）、可读性底线、仪表盘结构
        （KPI 必须带对比基准、三态设计）、以及**要求实际运行验证器**。
      - 通过 `BundledSkillDefinition.files` 释放 `validate_palette.mjs`（纯 Node、零依赖）：
        · WCAG 对比度：正文 ≥ 4.5:1、图形 ≥ 3:1，**白底/黑底分别判定**
        · CIE76 ΔE 相邻色差 ≥ 20
        · 退出码反映结果（0 全通过 / 1 有不合格 / 2 用法错误），可直接接 CI
      - **实跑验证过**（不是只写不跑）：
        · 合格色板 `#1f77b4 #d62728 #2ca02c` → 全部通过，退出码 0
        · 浅色 `#ffffee` → 白底 1.01:1 判不合格，退出码 1
        · 近似色 `#ffffff #fffffe` → ΔE=0.5 判过近，退出码 1
        · **发现并修正两处实现缺陷**：
          (a) 原实现取白底/黑底对比度的**最大值**判级，导致白底上几乎看不见的浅黄
              被标成"正文级"；改为分别判定并列出各自等级。
          (b) 修好判定后退出码仍为 0（不合格未计入 failed），会让 CI 误判通过；
              改为"任一台常用背景不合格即计入失败"。
        · 顺带验证出一个真实结论：matplotlib 经典橙 `#ff7f0e` 在白底上只有 2.53:1，
          **达不到图形级 3:1**——这正是该被验证器抓出来的问题。
      - 测试：`tests/unit/dataviz-skill.test.ts`（9 用例）——技能定义/注册/提示词覆盖/文件声明 4 例，
        **验证器实际执行** 5 例（合格退出 0、过浅判不合格、近似色判过近、非法颜色不崩溃、无参数提示用法）。
      - 变异验证：① 对比度阈值归零 → 1 例失败；② 色差阈值归零 → 1 例失败；
        ③ 不合格不计数（退出码恒 0）→ 1 例失败。均已捕获。
      - 回归：`tsc` dataviz.ts 与 bundled/index.ts 0 错误。
      - 未做：TUI 实跑验证（需重新构建）；未验证 `files` 在首次调用时释放到磁盘的完整链路
        （技能定义层已声明，释放逻辑由 `bundledSkills.ts` 既有实现承担）。
- [x] **D4. `/auto-mode-setup` + `/checkup` —— 已完成（2026-10-22）**
      - **`/checkup`**（官方 v2.1.283，别名 `/prompt-audit`）：新建 `src/commands/checkup/index.ts`。
        · 审查 CLAUDE.md 等记忆文件与已加载技能的描述，找**会让模型行为变差**的写法：
          空泛指令（"注意代码质量"/"遵循最佳实践"，判为[高]）、不可证伪形容词（"高质量的"，
          判为[中]，附「删除后行为不变即属噪音」的判据）、CLAUDE.md 超 2000 tokens、
          重复行（判为[低]）
        · **只诊断不改文件**——修改是用户的决定
      - **`/auto-mode-setup`**（官方 v2.1.304）：新建 `src/commands/auto-mode-setup/index.ts`。
        · 检测 `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`/`pom.xml` 判断生态，
          检测 `.env`/`.env.local` 提示敏感文件
        · 对 `dangerousRm`/`backgroundAmpersand`/`suspiciousWindowsPaths` 逐项给建议与理由
          （例：Node/Python 项目常需后台起服务 → 建议关闭 `backgroundAmpersand` 拦截以减少误拦）
        · **默认只给建议，`--apply` 才写入**——这四个开关都在"拦不拦"的边界上，误配会让
          正常命令被反复拦下
      - 测试：`tests/unit/auto-mode-setup-checkup.test.ts`（11 用例）。
      - 变异验证：① 不检测空泛指令 → 1 例失败；② 不检测重复行 → 1 例失败；
        ③ 忽略 `--apply` 门控（默认就写入）→ 1 例失败。均已捕获。
      - **测试踩坑**：对 `src/commands.js` 用 `vi.spyOn` 仍会触发真实模块加载
        （扫技能目录 20s+），3 个用例超时。改用 `vi.mock` 整体替换该模块、
        只暴露被测命令用到的导出入，降到 95ms。
      - 回归：命令唯一性 5/5；`tsc` 两个新命令 0 错误。
      - 未做：TUI 实跑验证（需重新构建）。

**验收**：`/reload-skills` 在压缩后能恢复技能；`/skill-doctor` 输出未使用技能清单与 token 估算。

---

### 1.6 ✅ E 组：安全阀门 / 工具能力（全部补，与模型无关）

| 缺失项 | 版本 | 作用 | 本地现状 |
|---|---|---|---|
| `CLAUDE_CODE_DISABLE_WEB_FETCH` | 2.1.285 | 关闭 WebFetch | 无门控（`WebFetchTool/` 无 isEnabled 检查） |
| `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` | 2.1.212 | 子代理会话级上限（默认 200） | 仅并发上限，无会话累计上限 |
| `CLAUDE_CODE_DISABLE_FILE_MENTIONS` | 2.1.299 | @提及只给路径不给内容 | 无 |
| `CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS` | 2.1.233 | WebFetch 缓存 TTL | 硬编码 `CACHE_TTL_MS = 15*60*1000`（`WebFetchTool/utils.ts:63`） |
| Read 工具 `allow_large` | 2.1.296 | 大文件一次性读取 | 无 |
| WebSearch 会话级上限 | 2.1.212 | 默认 200 次 | 无 |
| `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` | 2.1.296 | 工作流 agent 统一模型 | 无（对 DeepSeek 有用：统一走便宜模型） |
| vim 模式 `%` motion | 2.1.301 | 跳转匹配括号 | 无 |
| `CLAUDE_CODE_TOOL_MEMORY_LIMIT` | 2.1.233 | Bash 内存限制 | 无（Linux-only，Windows 跳过） |
| 权限规则 `Tool(param:value)` | 2.1.170 | 参数级匹配 | **已有基础**（`permissionRuleParser.ts`，需确认完整性） |

**修复计划（按改动成本排序）**：
- [x] **E1. `CLAUDE_CODE_DISABLE_WEB_FETCH` —— 已完成（2026-10-22）**
      - 改动：`src/tools/WebFetchTool/WebFetchTool.ts` 新增 `isEnabled()`，返回 `!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_WEB_FETCH)`；导入 `isEnvTruthy`。共 +5 行。
      - 生效路径：`src/tools.ts:539-548`（`getTools()`）与 `:220`（`getToolsForDefaultPreset()`）均按 `isEnabled()` 过滤，停用后工具从工具池移除。
      - 测试：`tests/unit/webfetch-disable-flag.test.ts`（5 用例）——默认启用、`1`/`true`/`yes`/`on` 停用、`0`/`false`/空 仍启用、过滤契约移除。
      - 变异验证：① 忽略环境变量恒返回 true → 3 例失败；② 反转真值 → 5 例失败。均已捕获。
      - 回归：`webfetch-disable-flag` + `toolSearchFilter` 共 24/24 通过；`tsc` 该文件 0 错误（`utils.ts` 4 处为存量问题）。
      - 未做：TUI 实跑验证（需重新构建）。
- [x] **E2. `CLAUDE_CODE_WEBFETCH_CACHE_TTL_MS` —— 已完成（2026-10-22）**
      - 新增 `src/tools/WebFetchTool/cacheTtl.ts`：`resolveWebFetchCacheTtlMs()` + `DEFAULT_WEBFETCH_CACHE_TTL_MS`。
        单独成文件的原因：TTL 在模块加载时求值，测试需反复重置模块缓存；若放在 `utils.ts` 会每次拉起
        axios/turndown/claude.js 等重依赖，单测由 40s 超时降到 0.5s。
      - `utils.ts`：`CACHE_TTL_MS = resolveWebFetchCacheTtlMs()`（原硬编码 `15 * 60 * 1000`）。
      - 语义：`Number()` 解析；NaN/Infinity/负数/0/空串一律回落 15 分钟（0 会让缓存形同虚设，负数会破坏 lru-cache ttl 语义）。
      - 测试：`tests/unit/webfetch-cache-ttl.test.ts`（6 用例）——默认值、合法值、非法值回落、小数不截断、确实读 process.env。
      - 变异验证：① 去掉 `> 0` 判断（接受 0/负数）→ 1 例失败；② 恒返回默认值 → 3 例失败。均已捕获。
      - 回归：两个 WebFetch 测试 11/11 通过；`tsc` 本文件 0 错误。
      - 未做：TUI 实跑验证（需重新构建）。
- [x] **E3. `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` —— 已完成（2026-10-22）**
      - 关键澄清：现有 `canSpawn()` 只看 `activeCount`（**并发**上限，2.1.217），
        官方 2.1.212 要的是**每会话累计**上限——两个不同维度，不能复用同一个计数。
      - `src/features/featureFlags.ts`：
        · 新增 `totalSpawned`（只增不减）+ `maxTotalSpawns` 字段，构造函数加第 4 个参数（默认 200）
        · `canSpawn()` 增加 `totalSpawned >= maxTotalSpawns` 判断（深度 → 累计 → 并发，三层）
        · `spawn()` 在**拿到名额之后**才 `totalSpawned++`（预检失败/排队放弃不消耗配额）
        · `getStats()` 暴露 `totalSpawned` / `maxTotalSpawns`
        · 新增 `parsePositiveInt()`：NaN/0/负数回落默认（NaN 会让 `total >= max` 恒为 false，上限形同虚设）
      - 测试：`tests/unit/subagent-session-cap.test.ts`（6 用例）——上限生效、只增不减、与并发独立、
        预检不计数、深度优先、getStats。
      - 变异验证：① 移除累计判断 → 4 例失败；② 预检就递增 → 2 例失败。均已捕获。
      - 回归：E1+E2+E3 共 17/17 通过；`tsc` featureFlags.ts 0 错误。
      - 未做：TUI 实跑验证（需重新构建）。
- [x] **E4. `CLAUDE_CODE_DISABLE_FILE_MENTIONS` —— 已完成（2026-10-22）**
      - 语义（官方 v2.1.299）：@提及只把**路径**交给模型，不预读文件内容；模型需要时自行用 Read 工具读取。
      - `src/utils/attachments.ts`：
        · 新增 `MentionPathOnlyAttachment` 类型（`type`/`filename`/`displayPath`，**无 content**）并加入 `Attachment` 联合类型
        · `processAtMentionedFiles()` 开头分流：`CLAUDE_CODE_DISABLE_FILE_MENTIONS` 为真时直接返回路径附件，
          跳过 `stat`/目录枚举/`generateFileAttachment` 全部读取路径
        · 抽出纯函数 `buildMentionPathOnlyAttachment()`：剥离 `#L42` / `#L10-20` / `#heading` 后缀，
          展开为绝对路径（行号不进入附件，读取范围交给模型）
      - `src/utils/messages.ts`：新增 `mention_path_only` 渲染分支，提示词为
        「用户提到了文件：X。此处只提供路径，未包含内容；如需查看，请使用 Read 工具读取。」
        （**不能**复用 `compact_file_reference`——那条文案说的是「内容过大无法包含」，语义不符）
      - 测试：`tests/unit/mention-path-only.test.ts`（6 用例）——类型无 content、绝对路径展开、
        `#L42`/`#L10-20`/`#heading` 剥离、绝对路径保持。
      - 变异验证：① 不剥离行号后缀 → 3 例失败；② 附件附带 content 字段 → 1 例失败。均已捕获。
      - 回归：E1-E4 + sessionMention 共 31/31 通过；`tsc` 两文件 7 处错误与基线一致（存量，无新增）。
      - **[已补] 端到端测试（2026-10-22）**：`tests/unit/mention-path-only-e2e.test.ts`（4 用例）
        · 设标志后**真实 `getAttachments`** 返回 1 个 `mention_path_only`，且整个返回值
          **不含文件内容特征串**（`SECRET_MARKER_ALPHA`），也不出现带内容的 `file` 附件
        · 多个 @提及 → 逐个转路径附件；文件不存在仍返回路径（不校验存在性，符合官方语义）；
          `#L10-20` 后缀被剥离
      - 变异验证：① 忽略环境变量（永远读内容）→ 4 例全失败；② 附件类型改成 `file` → 4 例全失败；
        ③ 不剥离 `#L` 后缀 → 1 例失败。均已捕获。
      - **测试环境踩坑（已记录）**：`getAttachments` 首次调用在 **vitest 下要 20s+**
        （重依赖转译 + mock 装载），而 **bun 下同样调用仅 91ms**——是测试环境开销，不是产品行为。
        处理方式：把首次调用移到 `beforeAll` 预热一次（60s 超时），用例本身降到 6–9ms。
        另：`vi.spyOn` 对 ESM 导出**无效**（内部调用的是本地绑定而非导出对象属性），
        因此「未设标志时读取内容」的对照组被跳掉，理由写在测试注释里；
        其要防的「管线根本没工作导致假通过」风险已由「设标志时确实返回了附件」覆盖。
      - 未做：TUI 实跑验证（需重新构建）。
- [x] **E5. Read `allow_large` —— 已完成（2026-10-22）**
      - 语义（官方 v2.1.296）：忽略常规大小限制，一次读完整个文本文件。
      - `src/tools/FileReadTool/FileReadTool.ts`：
        · `inputSchema` 新增 `allow_large: z.boolean().optional()`
        · `call()` 收到 `allow_large` 为真时，把 `maxSizeBytes` 与 `maxTokens` 都置为 `Infinity`
          （两个上限都必须越过：只放行字节数仍会被 token 校验拦下）
        · 与 `offset`/`limit` **互斥**：同时使用直接抛错，而不是静默忽略
          （否则「读一部分」会被悄悄变成「读全部」）
      - 生效机制核查：`readFileInRange` 中「`maxBytes` 已定义且文件大小超过它」的判定对 `Infinity`
        恒为假；`validateContentTokens` 的 `tokenEstimate <= maxTokens / 4` 对 `Infinity` 也恒成立
        → 两处均正确跳过。
      - 测试：`tests/unit/read-allow-large.test.ts`（5 用例，**真实文件端到端**）——
        408KB 文件默认被拒、allow_large 后可读、与 limit 互斥报错、与 offset>1 互斥报错、offset=1 不冲突。
      - 变异验证：① `maxSizeBytes` 不绕过 → 2 例失败；② 移除互斥校验 → 2 例失败。均已捕获。
      - **过程中踩到的坑（已记录）**：首次变异用 `node -e` 内联替换，因文件是 CRLF 行尾而未匹配成功，
        但脚本未校验匹配数就报告「已应用」，导致测试「通过」是假象。改用脚本文件 + 显式 `includes`
        校验后才真正生效。教训：**变异测试必须确认变异体真的写进了文件**（本次靠回读 `rg` 确认）。
      - 回归：E1-E5 共 28/28 通过；`tsc` FileReadTool.ts 0 错误（`imageProcessor.ts` 为存量问题）。
      - 未做：TUI 实跑验证（需重新构建）。
- [x] **E6a. WebSearch 会话级上限 —— 已完成（2026-10-22）**
      - **修复前是真实的「配置存在但功能未生效」**：`WebSearchTool.ts` 原代码只读 `getStats().maxSearches`
        打了一行 `console.log`，注释自己写着「ponytail: 仅日志，未实现会话级计数器」。
        `canSearch()` / `recordSearch()` 全仓**零调用点**，上限从未生效。
      - `src/tools/WebSearchTool/WebSearchTool.ts`：
        · `call()` 开头改为真实校验：`if (!searchMgr.canSearch()) throw`，错误信息含已用/上限
        · 搜索真正执行后调用 `searchMgr.recordSearch()`
        · 位置有意放在「缓存处理」提前返回**之后**——缓存命中未发出真实搜索，不应消耗配额
      - 测试：`tests/unit/websearch-session-cap.test.ts`（8 用例）——
        计数上限行为 4 例 + 源码契约 4 例（调用点存在、recordSearch 在缓存返回之后、占位注释已移除）
      - 变异验证：① `if (false)` 跳过上限检查 → 1 例失败；② recordSearch 移到缓存之前 → 1 例失败。均已捕获。
      - 回归：E1-E6a 共 36/36 通过；`tsc` 该文件 2 处错误与基线一致（存量，函数签名问题，与本次无关）。

- [ ] **E6b. `CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` —— 阻塞（架构不支持，2026-10-22 核实）**
      - **核实结论：本地没有「工作流子代理」这一机制**，无法实现该配置。
      - 证据：
        · `WorkflowTool.executeWorkflowStep()`（`WorkflowTool.ts:105-108`）只做 `${var}` 插值，
          返回字符串 `` `[执行] ${interpolated}` ``——**不调用 LLM、不启动子代理、不执行真实操作**
        · `WorkflowTool.ts` 全文（312 行）无任何 `runAgent`/`spawnAgent`/`AgentTool` 引用
        · `LocalWorkflowTask` 只是任务状态容器（记录 steps/进度），不含执行逻辑
        · `runAgent.ts` 的 `transcriptSubdir`（唯一可能标识工作流子代理的参数）**从未被任何调用方传入**
      - 官方语义是「工作流 agent 用此模型，其他子代理不受影响」，本地无法区分「工作流子代理」与普通子代理，
        强行实现只能退化为全局 `CLAUDE_CODE_SUBAGENT_MODEL`，属虚假实现。
      - **前置依赖**：需先把工作流引擎做成真正的子代理编排（WorkflowTool 通过 runAgent 启动子代理并传
        transcriptSubdir/querySource），届时再据此实现模型分流。这是新功能开发，非配置对齐。
      - 现有可用的替代：`CLAUDE_CODE_SUBAGENT_MODEL`（`src/utils/model/agent.ts:43`）已生效，全局控制子代理模型。
- [x] **E7. vim `%` motion —— 已完成（2026-10-22）**
      - 对齐官方 v2.1.301：跳到匹配的括号，可与 d/c/y 组合。
      - `src/vim/types.ts`：`SIMPLE_MOTIONS` 新增 `'%'`（走 `resolveMotion` 通用通路，自动获得 count 支持）
      - `src/vim/motions.ts`：
        · `applySingleMotion` 新增 `case '%'`；`import type { Cursor }` 改为值导入（需 `new Cursor(...)`）
        · 新增 `matchBracket()`：光标在开括号→跳闭括号，在闭括号→跳开括号，
          不在括号上→本行内向后找第一个括号；支持 `()`/`[]`/`{}`/`<>` 与嵌套深度计数
        · 新增 `findLogicalLineEnd()`：定位后续搜索的行边界
        · 找不到匹配时返回 `null`，调用方保持原位（与 vim 一致：不匹配不移动）
      - 测试：`tests/unit/vim-percent-motion.test.ts`（10 用例）——注册、开↔闭、嵌套、四种括号、
        向后查找、本行无括号不动、不匹配不动、跨行匹配、多处括号取最近。
      - 变异验证：① 不区分开闭方向恒向前 → 2 例失败；② 去掉嵌套深度计数 → 1 例失败。均已捕获。
      - 回归：vim 全部测试（含既有 operators/textObjects）95/95 通过；`tsc` src/vim 0 错误。
      - **补做：`d%` / `c%` / `y%` 组合（2026-10-22）—— 发现 2 个真实缺陷**（此前标注「未验证」是对的）：
        · **缺陷 1**：`%` 未列入 `isInclusiveMotion()`，被当作排他式 → `d%` 留下孤立闭括号
          （`x(abc)y` → `x)y`），`y%` 复制不到闭括号（得到 `(abc`）。
          修复：`isInclusiveMotion` 改为 `'eE$'.includes(key) || key === '%'`。
        · **缺陷 2**：包含式的范围扩展带方向限制 `cursor.offset <= target.offset`，
          反向（从闭括号回到开括号）不扩展 → `d%` 仍留下闭括号。
          修复：`getOperatorRange` 去掉方向限制，统一 `to = nextOffset(to)`
          （反向时 `to` 正是光标所在字符，扩一格正好含住它）。
      - 测试：`tests/unit/vim-percent-operator.test.ts`（8 用例）——d% 正向/反向、y% 寄存器、c% 进插入、
        嵌套、跨行、不匹配不动、光标不在括号上。
      - **用真实 vim 8.1 交叉验证全部期望值**（`vim -u NONE -N -e -s`）：
        · `x(abc)y` 光标在 `(` 或 `)` → `d%` 均为 `xy`
        · `x(a(b)c)y` 外层 → `xy`
        · `f(\n  x\n)z` → `fz`（跨行）
        · `a(b` → `a(b`（不匹配不动）
        · **`ab(cd)e` 光标在 offset 0 → `e`**（我最初期望 `abe`，vim 实测证明是**我的期望错了**：
          范围从光标起算而非从括号起算，已修正）
      - 变异验证：① `%` 不再是包含式 → 7 例失败；② 移除包含式扩展 → 7 例失败。均已捕获。
      - 回归：vim 全部（含既有 operators/textObjects）103/103 通过；`tsc` src/vim 0 错误。
      - **测试 fixture 的坑（已记录）**：`Cursor.equals()` 比较 `measuredText` 的**引用相等**，
        fixture 里 `get cursor()` 每次新建实例会让 `equals` 恒为 false，导致「不匹配括号不移动」
        用例假失败。必须构造稳定实例（真实运行时 `ctx.cursor` 也是稳定对象）。
      - 未做：TUI 实跑验证（需重新构建）。
- [x] **E8. `CLAUDE_CODE_TOOL_MEMORY_LIMIT` —— 已完成（2026-10-22）**
      - 新增 `src/utils/shell/memoryLimit.ts`：
        · `parseMemoryLimitBytes()`：支持纯字节与 `512K`/`2G`/`1.5G`/`1T`（大小写、可带 B）；
          未设置或非法值（NaN/0/负数/未知单位）一律返回 `null`（**不静默套用用户没要求的限制**）
        · `buildMemoryLimitedSpawn()`：Linux + systemd-run 可用时，构造
          `systemd-run --scope --quiet --collect --property=MemoryMax=<bytes> -- <原命令>`
        · `detectSystemdRun()`：探测并缓存；非 Linux 直接返回 false（零子进程开销）
      - `src/utils/Shell.ts`：在 `execWithProvider` 选启动命令处接入——包装成功则用
        systemd-run 起，否则**原样启动**（`baseSpawnBinary`/`baseShellArgs` 保持不变）。
      - 平台策略：Windows/macOS 无 cgroup → 不包装，行为与改动前完全一致。
        Linux 但无 systemd-run（容器/Alpine）→ 同样不包装，**不阻断命令**（限制是加固手段，
        不该成为可用性依赖）。
      - 测试：`tests/unit/tool-memory-limit.test.ts`（10 用例）——解析（未设置/字节/各单位/小数/非法值）、
        非 Linux 不包装、无 systemd-run 不包装、无计划不包装、Linux 包装后原命令参数原样保留。
      - 变异验证：① 移除平台门控 → 1 例失败；② 非法值套用默认 2G → 1 例失败；
        ③ 移除 `--` 分隔符 → 1 例失败。均已捕获。
      - **未验证（重要）**：本机是 Windows，**真正的 cgroup 限制未经实机验证**。
        已验证的只是参数解析与启动参数构造；`systemd-run --scope` 在 Linux 上是否按预期
        限制内存、退出时 scope 是否被 `--collect` 正确回收，需在 Linux 上实测。
      - 回归：`win-shell-resolve` + 本测试 15/15 通过；`tsc` memoryLimit 0 错误，
        `Shell.ts` 1 处为存量问题（`'bash'|'cmd'` 与 `'pwsh'` 无重叠）。
      - 未做：TUI 实跑验证（需重新构建）。
- [x] **E9. `Tool(param:value)` 完整性 —— 已完成（2026-10-22）**
      - 核实结论：解析层与匹配层**均已存在**（`permissionRuleParser.ts` + `getParamRuleForTool`），
        但**缺少官方要求的 `*` 通配符**。实测：`Agent(model:*)` 被解析成
        `ruleContent: "model:*"` 而非参数规则 → **完全失效**。
      - 核心难点：`Agent(model:*)`（参数通配）与 `Bash(prefix:*)`（位置式前缀规则）在字符串层面
        无法区分，而解析层拿不到工具 schema。原实现用「含 `*` 就退化为 ruleContent」规避，
        代价是参数通配失效。
      - 方案（经用户确认）：**解析层保持原样**（含 `*` 仍走 ruleContent，既有 `Bash(prefix:*)` 行为不变），
        在**匹配层**用本次调用的真实 `input` 消歧——若 `ruleContent` 形如 `key:pattern` 且
        `input[key]` 存在，则按参数通配匹配；否则归位置式路径。
      - `src/utils/permissions/permissions.ts`：
        · `getParamRuleForTool` 拆成路径 A（解析层已识别的精确参数规则）与路径 B（ruleContent 通配）
        · 新增 `matchesParamValue()`：`*` 匹配任意值，`opus*` 前缀通配，其余按字面相等
      - `src/utils/permissions/permissionRuleParser.ts`：补注释说明「含 `*` 一律保留 ruleContent」的
        判断依据与消歧责任在匹配层（无逻辑改动，+4 行注释）。
      - 测试：`tests/unit/param-rule-wildcard.test.ts`（8 用例）——`model:*` 任意匹配、
        `opus*` 前缀、无该参数不命中、`Bash(prefix:*)` 不被误判、精确值回归、跨工具隔离、ask/allow 同样生效。
      - 变异验证：① 跳过 ruleContent 通配路径 → 3 例失败；② 通配退化为精确相等 → 3 例失败。均已捕获。
      - 回归：权限全部测试（含既有 parser/param/check 三套）27/27 通过；`tsc` 4 处错误与基线一致（存量）。
      - 未做：TUI 实跑验证（需重新构建）。

---

### 1.7 ❌ 不跟进的官方能力（路线差异，非债务）

云会话（`--cloud`/`--environment`/`--teleport`）、Remote Control、Claude Tag/Slack、VSCode/JetBrains 插件、Claude Desktop、企业 gateway、Claude in Chrome、Mantle/Bedrock/Vertex/Foundry、全部 OTEL。

本地替代：`server` + 本地桥（5678）+ Android 客户端 + 隧道。

---

### 1.8 CLI 参数（按适用性筛选）

| 参数 | 版本 | 适用性 | 处置 |
|---|---|---|---|
| `--exclude-dynamic-system-prompt-sections` | 2.1.98 | 提升 prompt cache 命中 —— DeepSeek 也有上下文缓存计费 | ✅ 补 |
| `--permission-prompts none` | 2.1.259 | 无头环境自动拒绝弹窗 | ✅ 补 |
| `--max-findings` | 2.1.288 | `/code-review` 报告数量 | ⚠️ 可选 |
| `--append-subagent-system-prompt-file` | 2.1.261 | 子代理提示词文件 | ⚠️ 可选 |
| `--disallow-tools`、`--marketplace`、`--values-stdin`、`--accept-command`、`--enabled`、`--disabled` | 2.1.163–2.1.299 | plugin 体系增强 | ⚠️ 可选 |
| 自托管 runner 族 10 个（`--shutdown-drain-sec` 等） | 2.1.238–2.1.299 | 企业云部署 | ❌ 跳过 |

- [x] **F1. `--exclude-dynamic-system-prompt-sections` —— 已完成（2026-10-22）**
      - 官方语义（v2.1.98）：把 cwd/env/git 等动态段落移到首条用户消息，使系统提示词
        跨会话保持字节一致，提升 prompt cache 命中。
      - `src/constants/prompts.ts`：
        · 抽出 `STATIC_SYSTEM_SECTIONS()`（语言 + 静态段落），与 `dynamicSections` 分离
        · `isDynamicSectionsExcluded()` 读 `CLAUDE_CODE_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS`
        · 开关开启时把 `dynamicSections` 存入 `deferredDynamicSections` 并**不拼进系统提示词**
      - `src/context.ts`：`getUserContext()` 追加 `dynamicSystemPromptSections` 字段，
        把推迟的段落注入首条用户消息——**内容不丢**，只是换了挂载位置。
      - `src/main.tsx`：新增 `--exclude-dynamic-system-prompt-sections` 参数，翻译为环境变量。
      - 测试：`tests/unit/fgroup-cli-flags.test.ts` 中 4 例（开关语义 + 推迟段落默认为空）。

- [x] **F2. `--permission-prompts <host|none>` —— 已完成（2026-10-22）**
      - 官方语义（v2.1.259）：`none` 时无人值守环境里凡需弹窗的调用**自动拒绝**，
        而不是挂起等待一个永远不会来的回答。
      - 新增 `src/utils/permissions/permissionPromptsMode.ts`：
        `parsePermissionPromptsMode()` + `permissionPromptsMode()`
      - `src/hooks/useCanUseTool.tsx`：在权限决策返回「非 allow」之后、真正弹窗之前插入
        `none` 拦截，直接 `buildDeny` 并记录 decision 日志。
      - `src/main.tsx`：新增参数；**非法值回落到 host 并打印警告**——不能让一个拼写错误
        把整个会话变成「一律拒绝」。
      - 测试：6 例（默认 host、大小写不敏感、非法值回落且标记无效、环境变量读取）。
      - 变异验证：① 非法值当成 `none` → 2 例失败；② 恒返回 host 不读环境变量 → 1 例失败。均已捕获。

- 回归：F 组 + 权限全部测试 29/29 通过；`tsc` 新增文件 0 错误
  （`useCanUseTool.tsx` 1 处为存量问题，与基线一致）。
- **注意**：`src/main.tsx`、`src/constants/prompts.ts` 工作区存在其它并发会话的未提交改动
  （`modelReadiness` 相关逻辑、`DiscoverSkillsTool` 导入路径修正），本次只新增自己需要的行。
- **[已补] 无头路径覆盖（2026-10-22）**：`src/cli/print.ts` 的 `getCanUseToolFn` 有**三条分支**
  （`stdio` / 无提示工具 / MCP 提示工具），此前只接了交互式 UI，无头模式下 `none` 完全无效。
  - 做法：抽出 `applyNoneModeToDecision()`（`permissionPromptsMode.ts`），在 `getCanUseToolFn`
    最外层用 `wrapNoneMode()` 统一包装三条 return——单点保证不遗漏分支。
  - 语义：仅 `ask` → `deny`；`allow`/`deny` 原样透传（显式规则优先）。
  - 同时清理了一处内联的重复判断（会形成两处逻辑且引用了已删除的导入）。
  - 测试：`tests/unit/permission-prompts-headless.test.ts`（7 用例）——none/host 转换、
    allow 不拦、deny 保留原理由、读环境变量、非法值回落，外加**源码契约**断言
    「三条分支都套了 wrapNoneMode」（防止将来新增分支时漏接）。
  - 变异验证：① 模式判断写反 → 4 例失败；② 连 allow/deny 一起改 → 2 例失败；
    ③ 只给两条分支套包装 → 1 例失败（契约测试捕获）。均已捕获。
  - **测试环境踩坑**：直接 import `print.ts` 在 vitest 下要 10s+（`tools.js`、
    `remoteManagedSettings` 等顶层重依赖），5 个用例超时。改为把逻辑抽到轻量模块单测，
    耗时降到 868ms；`print.ts` 的接入完整性由源码契约测试保证。
- 未做：TUI 实跑验证（需重新构建）。

---

## 二、执行顺序建议

```
第一阶段（低风险、改动小）
  E1 → E2 → E3 → E4    安全阀门（WebFetch 门控/TTL、子代理上限、文件提及）

第二阶段（工程收益）
  D1 → D2              技能生态（/reload-skills、/skill-doctor）
  B1 → B2              退避参数化
  F1 → F2              CLI 参数

第三阶段（按需）
  E5 → E9、D3 → D4、F3
```

## 三、通用验收要求

每项完成时必须满足（来自 `.dogerules`）：

1. 相关测试全部通过
2. 使用说明已更新
3. 功能实际可运行不卡死
4. 新测试经**变异测试**验证（故意注入缺陷，确认测试会失败）
5. `git diff --stat` 行数与实际改动相符（防行尾污染）
6. 环境变量均应有明确的默认值，不改变现有行为
