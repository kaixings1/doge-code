# TASK.md — 代码审查与重构计划

生成时间: 2026-08-28
状态: 进行中

---

## P0 — 立即执行（低风险）

### [x] 1. 修复 commands.ts 重复导入
- **文件**: `src/commands.ts`
- **问题**: `collab` 命令在第 26 行和第 110 行重复导入
- **操作**: 删除第 110 行重复导入
- **验证**: `bun run lint` 通过

### [!] 2. commands.ts 动态注册改造 — 经查证为「已回退方向」，建议不再执行
- **文件**: `src/commands.ts` → `src/commands/`
- **原始目标**: 100+ 静态导入改为动态扫描 `commands/` 目录自动注册（OCP）
- **2026-09-17 查证结论**: 该方向已被尝试并回退至少 4 次，非「未开始」
  - `df71dcead` fallback 改用 COMMAND_MODULES 静态注册表（首次引入）
  - `03ff8b6eb` commands.ts 直接使用 COMMAND_MODULES 作为默认值
  - `69f0c35df` multiExportCommands 改用 COMMAND_MODULES，280 → 440 个命令
  - `045ddbd4e` Expand commands.ts with multi-export + conditional command support
  - 这 4 次提交全部是 `fix`，全部在修「编译后命令不可用」
  - **当前 `COMMAND_MODULES` / `COMMAND_REGISTRY` 在 src/ 下零引用（仅自引用），接线已被回退**
- **回退根因**: `bun build --compile` 后 `import.meta.dir` 指向虚拟路径 `B:/~BUN/root/`，磁盘上不存在 `commands/` 目录，动态扫描不可用；静态注册表又需人工同步
- **当前生成物质量不足以直接接线**:
  - `src/generated/command-modules.ts`：220 个模块导入，而 `commands.ts` 仅需 151 个 → **多收 69 个辅助文件**（如 `_shared/strings.ts` → key `_shared-strings`、`add-dir/validation.ts` → key `add-dir-validation`）
  - key 由**文件路径派生**而非模块 `default.name` → `add-model-add-model` ≠ 真实命令名 `add-model`
  - 丢失 `COMMANDS()` 数组中人工编排的顺序（影响 /help 与补全排序）
- **建议**: 不执行接线。若仍需 OCP，正确做法是改造 `scripts/gen-command-registry.ts`——① 只收 `index.ts/index.tsx` 与顶层单文件命令；② key 改为读取模块 `default.name`；③ 顺序由 `sortOrder` 等显式字段声明而非字典序。改造前需先能验证 280 个命令的注册/别名/type 全量对齐

### [x] 9. openaiCompat 配对工具 XML 解析修复
- **文件**: `src/services/api/openaiCompat.ts`
- **目标**: 修复采集/流式工具调用未配对闭合标签导致的 pending 误裁决、解析失败吞内容
- **操作**:
  - pending 追加逻辑：2KB 超长 + 3 秒超时双保险裁决（`tooLong`/`tooOld`）
  - pending 进入逻辑：`skipFlush` 替代 `continue`，进入时记 `enteredAt`
  - `flushBufferedText` 单换行触发刷新（`hasNewline` 替代 `hasDoubleNewline`）
  - `parsePendingToolXml` 改为 `<parameter=` 行首匹配，新增 `stripToolXmlTags` 剥离闭合标签
  - `indexRef` 起始 `1000000` → `100`
- **验证**: openaiCompatStream.test.ts 5/5 通过；7 个 XML 示例单测全部符合预期（taskId 数值化、replace_all 布尔化、`||`/`"` 原样保留、反斜杠路径保留）
- **注意**: 一次流多 `<function=>`、`reasoning_content` 通道内的 XML 暂未覆盖（已知边界）

### [x] 10. Windows 流式正文不实时刷新修复
- **文件**: `src/ink/terminal.ts`
- **根因**: `hasCursorUpViewportYankBug()` 在 `win32` 硬编码恒 `true` → `REPL.tsx` 的 `showStreamingText` 恒 `false` → `onStreamingText` 空执行 → 流式正文实时通道完全失效，正文只能靠 `content_block_stop` 整块一次性 setMessages（"流式不刷新，结束一次性显示几页"）
- **操作**: `hasCursorUpViewportYankBug()` 移除 `process.platform === 'win32'` 强制禁用，仅保留 `WT_SESSION`（WSL-in-Windows-Terminal，走 conhost 仍防卷屏）
- **取舍**: 原生 Windows 终端（conhost / Windows Terminal）恢复流式正文实时刷新，代价为可能触发 conhost 光标卷屏回跳（microsoft/terminal#17474）
- **验证**: biome 通过；全量测试无新增失败（106 fail / 68 errors 为既有 pre-existing）
- **后续**: 若流式恢复后出现"工具调用后正文回退/流中断"，为 openaiCompat index 连续性 + claude.ts `contentBlocks[index]` 找不到块抛 RangeError 问题（方案 C），需另处理

### [x] 11. /login 命令消失修复
- **文件**: `src/commands/login/index.ts`
- **根因**: `login/index.ts` 导出格式偏离其他命令——写成 `export default () => ({...})`（工厂函数），其余命令均为 `export default {...}`（直接命令对象）。`getGlobCommands()` 将 `mod.default` 直接当 Command 读取，login 的工厂函数使其被当作无效数据（name/type 为空），无法作为 `/login` 注册
- **操作**: 去掉 `() =>` 工厂包装，改为直接导出命令对象，字段（type/name/description/isEnabled/load）原样保留
- **验证**: `getCommands()` 中 login 出现且 `type=local-jsx`、`isEnabled()=true`、`load` 存在；`builtInCommandNames` 含 `login`；login.test.ts 1/1 通过
- **注意**: 排查其他命令是否也有"工厂函数"式导出，避免同类问题

### [x] 12. 工具组配置化（对应挂起后台任务 bg-mu2gfg0i）
- **新增文件**:
  - `src/utils/toolGroups.ts` — 工具组配置与过滤逻辑（读 ~/.doge/config.json 的 toolGroups 段）
  - `src/commands/toolgroup/index.ts` + `toolgroup.ts` — `/toolgroup` 命令入口
  - `src/__tests__/utils/toolGroups.test.ts` — 10 个测试用例
- **修改文件**:
  - `src/tools.ts` — `getAllBaseTools(options?: { unfiltered?: boolean })` 末尾接入 `filterToolsByActiveGroup`；新增 `unfiltered` 选项供管理界面展示完整工具清单
  - `src/commands.ts` — 注册 `toolgroup` 命令（+2 行）
  - `src/components/Settings/Config.tsx` — Settings 界面新增「当前工具组」枚举项（界面化，见下）
  - `src/utils/config/dogeConfig.ts` — 修复 `ensureDogeDir()` 缺少 `mkdirSync` 导入的既有 bug（~/.doge 不存在时首次写入抛 ReferenceError）
- **能力**（对应原需求逐条）:
  - 组内工具增删 → `/toolgroup add|rm <组名> <工具..>`
  - 全局组可用 → 内置 `global` 组语义为「全部工具」，不可增删
  - 全局组另存为命名组 → `/toolgroup new <组名>`（快照当前全部工具）
  - 运行时可切组、调整后立即生效 → `/toolgroup use <组名>`；`getAllBaseTools()` 每次重新构建且配置每次读盘，无需重启
  - 不删除已有功能 → 默认处于 `global` 组时过滤为恒等变换
- **界面化**（`src/components/Settings/Config.tsx`）:
  - 在 Settings 中新增 `type: 'enum'` 项「当前工具组：\<组名\>」，可直接下拉切换
  - 复用该文件既有模式：`useState` 回显 + `onChange` 写配置并触发重渲染（避免切换后 UI 显示旧值）
  - 仅当存在命名组时出现（只有 global 一个选项的枚举无交互意义，避免给不用此功能的用户添噪音）
  - `toolGroupList` 提到数组外只读一次配置，避免在长列表渲染中重复同步 IO
  - 边界：**组的创建/增删工具仍走 `/toolgroup` 命令**。Ink 的 Setting 类型仅支持 boolean/enum，复杂组编辑需专门子组件（如 ModelPicker 式的 managedEnum），成本高于收益
- **与既有机制的关系**: 环境变量 `CLAUDE_CODE_FEATURE_*`（`featureOverrides` 系统 + `loadConditionalCommand`）决定**加载期**工具是否存在；工具组是叠加其上的**运行期可见性**过滤器，两者不冲突
- **验证**:
  - `vitest run src/__tests__/utils/toolGroups.test.ts` → 10/10 通过
  - `vitest run src/__tests__/tools/ src/__tests__/commands/` → 292 文件 / 1015 测试全部通过
  - `tsc --noEmit --skipLibCheck` → 0 错误（含 Config.tsx 改动）
  - `biome check` 改动文件 → 通过
  - `bun run src/bootstrap-entry.ts --version` → EXIT=0（启动路径未破坏）
  - 端到端脚本（临时，已删）→ 13 项全通过：真实配置落盘/读回、`mkdirSync` 修复生效、切组过滤生效、拒绝不存在的工具与组、删除激活组后回落 global
- **已知边界**: 组只按工具名过滤，无法用组「开启」一个因环境变量而未 import 的工具（需在 `tools.ts` 的 conditionalImport 层扩展）

### [x] 13. 清理过期运行时任务状态
- **问题**: 会话 `3be8cea9` 的 `2.json`「创建任务执行器」停留在 `in_progress`，但其目标是 Electron 架构 `src/main/tasks/`，本仓库无 `src/main/`、`src/preload/`（属另一项目）
- **操作**: 该任务对应实现已于 `src/utils/taskExecutor.ts`（389 行）落地，状态改为 `completed`

### [x] 14. 修复 CLAUDE_CODE_MAX_RETRIES 非法值致所有 API 调用静默失败
- **文件**: `src/services/api/withRetry.ts`（`getDefaultMaxRetries()`）
- **根因**: 原实现 `return Math.min(parseInt(env, 10), 15)` 未校验 `parseInt` 结果。环境变量非法时 `parseInt` 返回 `NaN`，`Math.min(NaN, 15)` 仍为 `NaN` → `getMaxRetries()` 返回 `NaN` → 重试循环 `for (let attempt = 1; attempt <= maxRetries + 1; attempt++)` 中 `1 <= NaN` 恒为 `false`，**循环体一次都不执行**：不发任何请求，`lastError` 保持未赋值，紧接着 `withRetry.ts:583` 抛 `CannotRetryError`（携带未赋值的 lastError）
- **影响**: 一个手误的环境变量（如 `CLAUDE_CODE_MAX_RETRIES=abc`）会让**所有** API 调用立即失败且不发出任何请求，错误信息指向不明确的原因，极难定位
- **同类隐患**: 负数（如 `-5`）同样使循环不执行（`1 <= -4` 为 false）
- **操作**: 解析后校验 `Number.isFinite(parsed) && parsed >= 0` 才采用，否则回落到 `DEFAULT_MAX_RETRIES`（15）。保留 `0` 为合法值（不重试，循环仍执行 1 次）、保留上限截断 15、保留 watchdog 无限重试分支
- **新增测试**: `src/__tests__/api/withRetryMaxRetries.test.ts` — 9 个用例，覆盖未设置 / 合法值 / 0 / 超上限截断 / 非数字 / 负数 / 空串 / watchdog / 「返回值始终能驱动循环至少执行一次」不变量
- **验证**: 该测试 9/9 通过（修复前 `abc` 与 `-5` 两项必然失败，测试确实能拦住回归）；`tsc` 0 错误；`biome` 通过；全量 `vitest run` → 363 文件 / 1857 测试全部通过
- **为何不加 UI 项**: 该参数在**每次重试循环建立时**读取，不能做文件 IO（`loadDogeConfig` 是同步读盘），故 env 是正确设计；而 `settings.json` 的 `env` 已提供持久配置通道，再加会话级 UI 项是倒退

### [x] 15. 修复 AskUserQuestion 报「缺少必需参数 `questions`」（提示词与 schema 不一致）
- **现象**: 调用 `AskUserQuestion` 返回 `InputValidationError: ... 缺少必需参数 \`questions\``
- **文件**: `src/skills/bundled/scheduleRemoteAgents.ts:166,170`
- **根因**: 该技能的提示词指示的形状与工具 schema 不符
  - 提示词原文:「请使用以下精确字符串作为 **`question`** 字段 …… 设置 **`header: "操作"`** 并提供四个操作选项」
  - 实际 schema（`AskUserQuestionTool.tsx:62`）: `z.strictObject({ questions: z.array(questionSchema()).min(1).max(4), ... })`，且 `header` / `options` 是 `questions[]` 元素**内部**的字段
  - 即提示词把模型引向扁平结构 `{question, header, options}`，而 schema 要求 `{questions: [{question, header, options}]}`
  - 正确形状的权威说明见 `src/components/tasks/RemoteSessionDetailDialog.tsx:51` 注释：`// Input shape is {questions: [{question, header, options}]}.`
  - 且 `inputSchema` 用 `z.strictObject` → 顶层多余键 `question`/`header`/`options` 被拒；配合 commit `df289e601` 在 zod 校验前**过滤未知字段**的逻辑，这些键被剥掉后只剩 `{}`，于是唯一报错正是「缺少必需参数 `questions`」——与现象完全吻合
- **非回归**: 该错误自 `5070d4a27 Initial commit` 就存在（英文原文同样是 `Use this EXACT string for the \`question\` field` + `Set \`header: "Action"\``），`39a11b9ea 大改提示词后提交` 只是把它译成中文，未引入也未修复
- **操作**: 改写提示词，明确 `questions` 数组包裹与嵌套字段关系：
  - 参数形如 `{questions: [{question, header, options}]}`：在 `questions` 数组中放入一个问题，其 `question` 字段使用精确字符串
  - 该问题的 `header` 设为 `"操作"`，`options` 提供四个操作选项
- **为何不在工具层加兼容垫片**: 模型生成的工具输入确是信任边界，但此处是**本项目自己的提示词写错了**。修提示词是根因修复；加垫片会保留错误提示词，使所有调用方（含第三方模型）继续产出错误形状，属治标。且 .dogerules 明确「不要为不可能发生的情况添加回退」
- **同源排查**: 全库搜索「`question` 字段」类表述，另有 `src/commands/init.ts:81` 提到 `question` 字段，但其上下文是在描述问题对象**内部**字段（`question` 纯文本 vs `options[].preview` markdown），未要求顶层扁平结构，且无失败证据 → **不改**
- **验证**: `tsc` 0 错误；`biome` 通过；全量 `vitest run` → 364 文件 / 1869 测试全部通过
- **机制实证**: 已确认 `toolExecution.ts:620-635` 的实现——取 `rawSchema.shape` 的已知键（AskUserQuestion 为 `['questions','answers','annotations','metadata']`）过滤输入。扁平形状的 `question`/`header`/`options` 全部不属于已知键，被剥掉后剩 `{}`，故唯一报错是「缺少必需参数 `questions`」，与现象完全吻合
- **回归防护**: 新增 `src/__tests__/tools/askUserQuestionSchema.test.ts`（12 用例），其中核心用例即复现该路径：`stripUnknown(扁平形状)` 断言等于 `{}`、且错误 `path` 含 `questions`。另覆盖正确形状通过、`min(1)`/`max(4)`/`options min(2)`、问题文本与选项标签去重、`strictObject` 拒绝顶层未知键（过滤后可容忍）
- **同类排查**: 搜索「`question` 字段」类表述与「EXACT string / 精确字符串」式强制指令，仅 `scheduleRemoteAgents.ts` 一处命中；`AgentTool/prompt.ts:276` 的 `SendMessage` `to` 字段已核对 schema（`to: z.string()`）正确；`skills/bundled/skillify.ts:150` 的「不要使用 body 字段」是否定性提示，无误导
- **顺带加固**: 原提示词只说「提供四个操作选项」，未提 `options[].label` 与 `options[].description` 均为**必填**（schema 无 default），存在同类失效风险 → 补明二者必填
- **注意**: 该技能构建函数 `buildPrompt` 未导出，无法直接单测渲染结果；本次测试覆盖的是 schema 契约层，提示词文本正确性靠人工核对。如需更强防护，需先导出构建函数

---

### [ ] 3. main.tsx 拆分（仅计划，暂不执行）
- **文件**: `src/main.tsx`（238KB）
- **目标结构**:
  ```
  src/main/
    ├── index.tsx
    ├── providers/
    │   ├── SettingsProvider.tsx
    │   ├── StateProvider.tsx
    │   └── ToolRegistryProvider.tsx
    ├── screens/
    │   ├── REPL.tsx
    │   ├── StatusBar.tsx
    │   └── Welcome.tsx
    └── layout/
        ├── TerminalLayout.tsx
        └── ComponentTree.tsx
  ```
- **注意**: 拆分后功能测试复杂，列入计划但**暂不实际拆分**

---

## P2 — 可执行阶段（中低风险）

### [!] 4. tools.ts 条件加载标准化 — 经查证前提有误，不建议执行
- **文件**: `src/tools.ts`
- **原始描述**: 11 处 `require()` 动态加载打破循环依赖，模式分散，统一为 `conditionalImport()`
- **2026-09-17 查证结论**: 原始描述**混淆了两种目的不同的加载模式**，`src/tools.ts` 实为 4 类：
  - **A 类 · 条件加载 × 8**，已用 `loadConditionalCommand`：REPLTool、SleepTool、cronTools、RemoteTriggerTool、SendUserFileTool、PushNotificationTool、SubscribePRTool
  - **B 类 · 条件加载 × 9**，内联三元：VerifyPlanExecutionTool、OverflowTestTool、CtxInspectTool、TerminalCaptureTool、WebBrowserTool、coordinatorModeModule、SnipTool、ListPeersTool、WorkflowTool
  - **C 类 · 懒加载破环 × 3**：`getTeamCreateTool` / `getTeamDeleteTool` / `getSendMessageTool`（`tools.ts:100-108`）；另有 `getPowerShellTool`（`:188`）为条件 + 懒加载混合
  - **D 类 · 无条件直接 require × 1**：AgentProxyTool
- **C 类不可统一**: 其源码注释明确「懒加载 require 以打破循环依赖：tools.ts → TeamCreateTool/TeamDeleteTool → ... → tools.ts」。改 `loadConditionalCommand` 会把「每次调用时 require」变成「模块加载时求值一次」，**导致循环依赖回归**
- **A/B 类统一的收益**: 仅「模式一致」+ `safeRequire` 的 try/catch 兜底。但已实测 48/48 条件引用点全部解析成功、0 死条件（临时脚本，已删），**兜底收益当前为 0**
- **结论**: 纯重构、零功能收益、需改 9 处顶层模块加载逻辑（影响启动顺序与副作用，如 `WorkflowTool` 的 `initBundledWorkflows()`）。违背「最短能工作的 diff 赢」，**不做**


### [x] 5. Tool.ts 类型拆分
- **文件**: `src/Tool.ts`（803 行 → 40 行 barrel）
- **目标**（已完成）:
  ```
  src/types/
    ├── tool.ts           # Tool, Tools, ToolInfo, ToolDef, buildTool 等
    ├── toolContext.ts    # ToolUseContext, ToolPermissionContext, SetToolJSXFn 等
    ├── toolProgress.ts   # 所有 *Progress 类型 + filterToolProgressMessages
    └── toolPermission.ts # ToolPermissionRulesBySource（re-export from permissions.ts）
  ```
- **操作**:
  - 所有类型从 `Tool.ts`（803 行）拆分为 `src/types/` 下 4 个文件
  - `Tool.ts` 保留为 barrel re-export，保持向后兼容
  - `Tool` 与 `ToolUseContext` 互相引用，合入 `tool.ts` 避免循环依赖
  - `HookProgress` 从 `types/hooks.ts` re-export（原有定义冲突）
  - `ToolProgressData` 保留在 `types/tools.ts`（全库引用），`Tool.ts` re-export
  - `ToolPermissionRulesBySource` 改为 re-export `types/permissions.ts`（消除重复定义）
- **验证**: `tsc --noEmit --skipLibCheck` 拆分文件零错误；工具测试 146/146 通过

---

## P3 — 待评估（中风险）

### [!] 6. core.ts 迁移/移除 — 经查证前提有误（并非无引用），暂不执行
- **文件**: `src/core.ts`（34KB，GrowthBook SDK 实现）
- **原始描述**: 「确认无内部引用后迁移到 `vendor/` 或直接移除」
- **2026-09-17 查证结论**: **`src/core.ts` 是活的，有 3 个引用**：
  - `src/GrowthBook.ts:58` — `} from "./core";`
  - `src/GrowthBookClient.ts:43` — `} from "./core";`
  - `src/sticky-bucket-service.ts:7` — `import { getStickyBucketAttributeKey } from "./core";`
- **排查教训**: 首次搜索只匹配 `./core.js`（带扩展名），漏掉**无扩展名**的 `from "./core"`；同类失误另一次是只查 `.ts` 漏 `.tsx`（误判 `ultraplan.tsx` 不存在）。**搜索引用必须覆盖全部导入形式（带/不带扩展名、动态 import、require、别名）**
- **判断**: 「与 AI CLI 无关」属实，但它是被引用的分析 SDK，不是死代码。且 GrowthBook 相关文件是**一整套**（`core.ts` / `GrowthBook.ts` / `GrowthBookClient.ts` / `mongrule.ts` / `types/growthbook.ts` / `types/mongrule.ts` / `sticky-bucket-service.ts` / `auto-wrapper.ts`），`auto-wrapper.ts` → `GrowthBook.ts` → `core.ts` 构成链路
- **结论**: 若要迁移须**整体迁移整套 + 改 3 处导入**，属目录整洁性质，无功能收益且触及启动路径。**暂不执行**；如确要做，需先确认 `auto-wrapper.ts` 是否在启动路径上


### [!] 7. query.ts 与 query/ 合并 — 经评估不建议执行
- **文件**: `src/query.ts`（1638 行）+ `src/query/` 子目录（730 行，6 模块）
- **2026-09-27 评估结论**: **当前结构合理，合并无功能收益**
  - `query.ts` 是主查询引擎（`query()` + `queryLoop()` 生成器），`query/` 含 6 个聚焦模块：config/deps/emptyContentHandler/stopHooks/tokenBudget/transitions
  - 职责分离清晰，非模糊：config 负责配置快照、deps 负责依赖注入、emptyContentHandler 负责空内容自动继续、stopHooks 负责停止钩子调度、tokenBudget 负责令牌预算决策、transitions 负责类型定义
  - `query.ts` 是 `query/` 的唯一导入方，零外部引用 → "单入口" 已是事实
  - 合并回单文件会丢失已有拆分结构；`query/index.ts` barrel 重导出属无意义间接层
  - 纯重构、零功能收益、违背 YAGNI → **不做**

---

### [x] 16. 修复空输入框按 diw/ciw/yiw 崩溃（findTextObject 空文本越界）
- **文件**: `src/vim/textObjects.ts`（`findWordObject()`）
- **现象**: 空输入框上按 `diw`/`ciw`/`yiw`/`daw` 等文本对象操作，抛 `TypeError`（读取未定义值的 index 属性）
- **根因**: `findWordObject` 内
  ```ts
  let graphemeIdx = graphemes.length - 1          // 空文本时 = -1
  const offsetAt = (idx) => idx < graphemes.length ? graphemes[idx]!.index : text.length
                                                    // 只判上界，-1 < 0 成立
  ```
  空文本时 `graphemes` 为空数组 → `graphemeIdx = -1`；三个分支（word/ws/punct）全不成立（`test('')` 均为 false）→ `startIdx`/`endIdx` 保持 `-1` → 末尾 `offsetAt(-1)` 读取数组负索引处的未定义值 → **TypeError**
- **可达性（已确认，非理论）**: 两个调用点
  - `transitions.ts:363` `fromOperatorTextObj` —— **正常按键路径**（NORMAL 模式按 `d`→`i`→`w`）
  - `useVimInput.ts:164` `replayLastChange` —— 按 `.` 重复上次 textobj 操作
  两处均无 try/catch，异常沿 `TransitionResult.execute` 冒泡。空输入框是 CLI 中最常见的状态（刚启动/刚提交/刚清空）
- **操作**: 在 `findWordObject` 入口加 `if (text.length === 0) return null`。返回 `null` 与「未找到文本对象」语义一致，且 `executeOperatorTextObj` 已有 `if (!range) return` 守卫，等价于空操作
- **未采用的方案**: 给 `offsetAt` 加下界判断——能防同类越界但不表达意图，且会掩盖「空文本应为空操作」这一语义
- **同模块排查（已确证无其他同类问题）**: 新增 `src/__tests__/vim/operators.test.ts`（54 用例）对 `operators.ts` 全部 13 个导出函数做边界冒烟——8 种文本（空/单字符/纯换行/多行/前后空格/括号） × 每个偏移量，逐一调用全部函数。**54/54 通过，说明该模块仅此一处空文本崩溃**。另确认 `findQuoteObject`、`findBracketObject` 在空文本上原本就返回 `null`（安全）
- **新增测试**: `src/__tests__/vim/textObjects.test.ts`（30 用例）+ `operators.test.ts`（54 用例）
  - 边界用例：空文本 iw/aw/iW/aW、全空白文本，断言不抛异常
  - 语义用例：`iw`/`aw`（含吞后随空格、行尾吞前导空格）、标点、空白、`aW`；`i"`/`a"`/`i'`/反引号、引号仅本行配对；`i(`/`a(`/`ib`/`i)`、嵌套取最近层、外层括号、`i{`/`iB`/`i[`/`i]`/`i<`/`i>`、不配对返回 null
- **模块覆盖率**: `src/vim/**` 由 **0% → 已覆盖**（此前 1012 语句全未覆盖）
- **验证**: `textObjects.test.ts` 30/30、`operators.test.ts` 54/54（修复前空文本 3 项必然失败，测试确实拦得住回归）；`tsc` 0 错误；`biome` 通过；全量 `vitest run` → 366 文件 / 1954 测试全部通过
- **过程教训（我在本轮重复犯同类搜索错误）**: 查 `findTextObject` 调用方时，因 `head_limit` 截断而误判为「除测试外零调用」，实际 `operators.ts:15` 有导入。这已是本轮第三次同类失误（前两次：只搜 `.ts` 漏 `.tsx`、只搜 `./core.js` 漏无扩展名 `./core`）。**搜索引用时必须显式确认结果未被截断，并覆盖全部导入形式**

### [!] 8. 测试覆盖率 — 已测量，阈值为配置失真（未改动门禁）
- **命令**: `bun run test:coverage`（= `vitest run --coverage`）
- **2026-09-17 实测结果**（解析 `coverage/coverage-final.json`，44MB）：

| 指标 | 实测 | vitest.config.ts 阈值 | 差距 |
|---|---|---|---|
| 语句 / 行 | **10.88%** | 70% | 需提升 6.4 倍 |
| 函数 | **13.82%** | 70% | — |
| 分支 | — | 60% | — |

- **绝对量**: 被统计 2860 文件 / **513,987 语句**，已覆盖 55,931 语句
- **未覆盖主体**: **1328 个文件完全未覆盖（0%），合计 227,454 语句 = 全部语句的 44%**
- **未覆盖集中在结构上难测的代码**（按语句数）：

| 文件 | 语句 | 覆盖 |
|---|---|---|
| `src/cli/print.ts` | 4077 | 0% |
| `src/screens/REPL.tsx` | 3397 | 0% |
| `src/main.tsx` | 3377 | 0% |
| `src/commands/batch-han/batch-han.ts` | 3103 | 0% |
| `src/context-mode/**`（95 文件） | 23944 | **0%** |
| `src/components/**`（419 文件） | 72414 | 1.7% |
| `src/generated/**`（4 文件） | 2296 | **0%** |

- **判断**: 70% 阈值是**配置失真**而非可达目标。理由：① 主体是 Ink/React UI 组件与 CLI 入口，需完整渲染层才能测，而本项目**未安装 `ink-testing-library`**（无组件测试基础设施）；② 现有 1857 个测试以 `should be defined` / `should be a const` 形状断言为主，不驱动真实执行；③ `src/generated/**` 是机器生成代码，纳入覆盖率统计本身是测量错误
- **为何不修改阈值**: 覆盖率门禁属质量门禁。把阈值下调到实测值以让红灯变绿，正是「用破坏性捷径让问题消失」的反模式（见 .dogerules）。**改动门禁需团队决策，不由我单方面执行**
- **建议**（若采纳需团队确认）: 把阈值改为「按当前基线冻结 + 逐步提高」的棘轮模式（如 statements 12% 起步，每次只升不降），并先排除 `src/generated/**` 这类生成代码与 `src/entrypoints/**`
- **当前副作用**: `bun run test:coverage` **必然非零退出**（三条 ERROR 行），CI 若接入该命令会一直红

---

## P4 — 后续增强

---

## 挂起后台任务处置（2026-09-17）

运行时任务目录 `~/.doge/tasks/` 中两个长期挂起的 background 任务：

| 任务 | 创建时间 | 描述 | 处置 |
|---|---|---|---|
| bg-mu2gfg0i | 09-15 | 工具组环境变量配置化 | ✅ 已完成，见 #12 |
| bg-mu4dnjoo | 09-16 | 复查全部源码，硬编码参数/分支逻辑配置化 + 界面化 | ✅ 三个维度已复查完毕，结论见下（修掉 1 个真实 bug，见 #14） |

### 关于 bg-mu4dnjoo（硬编码配置化）

**实测结论（2026-09-17）：既有 `featureOverrides` 系统完整，无缺口，不需要改动。**

对全库 `CLAUDE_CODE_FEATURE_*` 检查点做了机器统计（临时脚本，已删）：

| 指标 | 数量 |
|---|---|
| 代码中实际检查的 FEATURE 变量 | 42 |
| `OVERRIDABLE_FEATURES` 已登记 | 48 |
| 在用但未登记 | 2（见下） |
| 已登记但代码中未直接检查 | 9 |

未登记的 2 个经核实**均为有意排除**，不是遗漏：
- `DUMP_SYSTEM_PROMPT`（`src/entrypoints/cli.tsx:88`）— 注释明确「仅 Ant 内部：通过 feature 标志从外部构建中排除」，需配合 `--dump-system-prompt` 参数
- `ULTRAPLAN`（`src/commands.ts:263`）— 命令在 `INTERNAL_ONLY_COMMANDS` 中，而该数组仅在 `process.env.USER_TYPE === 'ant'` 时注册（`src/commands.ts:718`）

`OVERRIDABLE_FEATURES` 是**暴露给外部用户的 Settings 开关列表**，把 Ant 内部特性登记进去属设计错误。故**不修改**。

**其他 env 布尔开关维度**（扫描全库 `process.env`，排除 FEATURE_* 与系统/凭据类）：

| 指标 | 数量 |
|---|---|
| `process.env` 变量总数 | 657 |
| 「布尔开关」形式（`=== '1'` / `'true'`）且非 FEATURE_* | 18 |
| 其中在 Settings UI 已有手写开关项 | 2（`CLAUDE_CODE_QQ`、`CLAUDE_CODE_SESSION_END_SOUND`） |

余下 16 个多为运行时/内部开关（`CLAUDE_CODE_REMOTE` 23 文件、`IS_SANDBOX`、`DEBUG`、`CTX_FETCH_STRICT` 等），**不适合暴露给终端用户**。仅 2 个手写 UI 项不足以支撑抽象（相似 3 行代码优于过早抽象）。

**→ 结论：在「env / 开关」维度上，本任务已无可做的改进项。**

### 维度三：硬编码数值参数（超时 / 限制 / 阈值 / 重试）

机器扫描全库（排除 tests/vendor/generated；临时脚本已删）：

| 指标 | 数量 |
|---|---|
| 硬编码数值参数候选（标识符名含 TIMEOUT/MS/DELAY/RETRY/MAX_/LIMIT/THRESHOLD/BATCH 等） | 404 |
| 不同标识符 | 366 |
| 同名参数散落在多个文件 | 22 组 |

**逐一核查 22 组同名参数后，结论是「不应批量配置化」**：

1. **多数为不同服务的正当独立取值**，不是漂移。例：`FETCH_TIMEOUT_MS` 5000/10000/60_000 分别对应 MCP、policyLimits、WebFetch —— 三者用途不同，强行统一反而错
2. **少数重复位于有意分叉的安全代码**。最典型是两份 `pathValidation.ts`：
   - `utils/permissions/pathValidation.ts`（485 行）
   - `tools/PowerShellTool/pathValidation.ts`（1913 行）
   - 5 个同名函数**0 个逐字相同**：`validatePath` 113 vs 228 行、`isPathAllowed` 123 vs 111 行、`expandTilde` 有平台守卫差异（`process.platform === 'win32'`）、`formatDirectoryList` 仅消息语言不同（英文 `, and N more` vs 中文 `，以及其余 N 个`）
   - → 这是 **PowerShell 专用的有意分叉**（需处理 `~\`、盘符、冒号值等），不是粗心复制。为省几十行而合并**安全校验代码**，风险远大于收益，**不动**
3. **结构性平行 ≠ 应合并**。`settings/changeDetector.ts`（488 行）与 `skills/skillChangeDetector.ts`（311 行）是同一「文件稳定性监听」模式的两份实现，合并可省约 300 行；但会牵动设置热重载与技能热重载两条用户可见链路，属高风险重构，**超出本任务范围，不做**

**配置化通道本就存在（关键发现）**：`settings.json` 已支持持久化 `env` 字段（`src/utils/settings/types.ts:35` 的 `EnvironmentVariablesSchema = z.record(z.string(), z.coerce.string())`）。即
```json
{ "env": { "CLAUDE_CODE_MAX_RETRIES": "5" } }
```
已可持久配置任意环境变量。**因此为这类参数另加 UI 项反而更差** —— 现有 Settings 中的 env 项（如 `CLAUDE_CODE_QQ`）只写 `process.env`，属会话级、重启即失效；而 `settings.json` 的 `env` 是持久的。

**→ 结论：不新增配置项、不做批量配置化。** 本次复查的唯一实质产出是下面修掉的一个真实 bug。

- **配置化闭环已存在**: `Settings/Config.tsx:1219` 直接遍历 `OVERRIDABLE_FEATURES` 生成 boolean 开关（写项目配置 + 设 env），即「往数组加一项 → UI 自动出现开关」，无需手工接线
- **需先界定范围**: 「复查所有源代码」无法一次性完成。建议按「发现一处 → 确认一处 → 改一处」推进，而非先全库普查后批量改
- **参照模板**: 工具组（#12）即为该方向的一个实例——把硬编码的可见性判断提取为可配置项 + 命令入口 + Settings 界面项，可作为后续同类改造的模板

---

## 执行规则

1. **YAGNI 阶梯**: 写代码前停在第一个能成立的阶梯
2. **Diff 级确认**: 每次修改后 `git diff` + grep 关键函数确认功能未丢失
3. **测试先行**: 修改前确认现有测试通过，修改后运行相关测试
4. **最小改动**: 每次只改一个文件/模块，保持可回滚
5. **不凭名字删文件**: 删除前确认无引用
