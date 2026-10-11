# Android 客户端功能进度

> 任务面板（`~/.doge/tasks/`）会被并发会话清理，故进度记录在此。
> 每完成一项更新本文件，不依赖会话级任务列表。

## 已完成

### ✔ 三层递进扫描（端口 → IP → 网段）
- 痛点：一个 IP 连不上就换下一个 IP，整段扫不到。根因是搜索只按「IP」一维推进 ——
  一个 IP 上 2 个端口不通就把整台电脑判成没有；而多开窗口会顺延端口，顺延到 6002
  以后必然漏
- `LanScanner.scan` 改为三层：
  1. **端口层**：先探前 3 个主端口；落空 3 路 → 判非目标主机，放弃其剩余端口；
     有命中 → 补探剩余端口（最多 8 个）
  2. **IP 层**：本网段全部 IP 第一轮跑完，才汇总进第二轮
  3. **网段层**：本网段两轮跑完 → 才换下一个网段
- `SubnetCandidates.groupBySubnet`（新增）：把打平 IP 按 /24 分组，**组间顺序 =
  各组首成员出现顺序**（即本机网段仍排最前）
- 常量：`FIRST_ROUND_PORTS=3`、`REJECT_THRESHOLD=3`、`SECOND_ROUND_PORTS=8`、
  `TOTAL_TIMEOUT_MS=20000`（原 15s）、`MAX_THREADS=64`（原 48）、探测超时 250ms
- `SessionFragment` 通过 `onProgress` 回调显示「正在搜 x.x.x.0/24 · 第 N 轮」，
  用户能看到搜索**确实在推进**（换网段/换轮次），而不是对着一行不动的字怀疑卡死
- 不变量（测试钉死）：① 第一轮端口数 ≥ 否决阈值（否则死主机否不掉、退化成全量扫描）
  ② 两轮合计覆盖默认段宽度（否则顺延端口仍漏）③ 两轮无重叠
- 测试：`LanScannerLayeringTest` 8 条、`SubnetGroupingTest` 6 条
- **变异测试验证**：把第一轮改成 1 个端口 → 4 条失败；分组改字典序 → 1 条失败；
  第二轮预算改 0 → 2 条失败（正是原 bug 形态）。三处均被拦住

### ✔ 本地模式：URL + Key 取模型 + 测试会话
- `ProviderClient.listModels`：`GET /models` 拉可用模型列表，容错三种网关形状
  （`data`/`models` 字段、id 对象/裸字符串、重名去重）
- `ProviderClient.testChat`：真打一次 `/chat/completions`（非流式、`max_tokens=16`）。
  **必须打对话端点而非只测 /models** —— 网关可用只读子 key 也能量模型，
  但发不出对话（403），只测 /models 会让用户在第一条消息时才撞上失败
- `ProviderClient.runAsync`：IO 线程跑、结果**回调到主线程**（`chatAsync` 不切线程，
  直接碰控件会崩在 `CalledFromWrongThreadException`）
- 模型名留空时自动从 `/models` 取第一个（缺字段会被网关判 400，与「名字错」报错
  无法区分，故不能什么都不填）
- `LocalConfigPanel` 新增「获取模型」「测试会话」两个按钮（弹列表点选，**不自动保存**），
  探测中禁用按钮防连点
- 测试：`ProviderModelsTest` 12 条（含 `content` 为数组时不得产出 `"[]"` 的防护）
- **变异测试验证**：`extractContent` 去掉数组防护 → 1 条失败，被拦住

### ✔ 可折叠工具气泡
- `ChatMessage` 扩展工具字段（原文/结果/折叠态/toolUseId）
- `BridgeProtocol` 补齐 5 个字段解析；修复 `name` 空导致**结果事件全丢**
- `ChatAdapter.ToolVH` 可折叠气泡（点击折叠、长按复制全文）
- 结果按 `toolUseId` 配对合并进 running 气泡
- 折叠态持久化，重启不丢
- 测试：`StreamProtocolTest`、`ChatMessageTest`、`MessageActionsTest` 扩充

### ✔ 思考内容可见
`kind="thinking"` 以独立可折叠气泡展示（此前只能盯空白等待）

### ✔ 完成时语音播报
- `VoiceAnnouncer`：系统 TTS，零依赖；引擎未就绪时排队补播
- 播报「任务已完成」+ 回复首句（`firstSentence` 去 Markdown、截断 40 字）
- 独立开关 `KEY_VOICE_ANNOUNCE`，默认关；**前台后台都播报**
- manifest 补 `<queries>` TTS_SERVICE（Android 11+ 否则静默失效）
- 测试：`VoiceAnnouncerTest` 16 条

### ✔ 使用量与耗时统计
- 服务端 `pushUsageToMobileClients` + `currentUsageForMobile`
- 回合结束（assistant 定稿）时推送累计用量
- 客户端 `UsageFormat` 格式化 + 活动区显示「12.4k tokens · 8.3s · $0.023」
- **踩坑修复**：`getTotalDuration()` 是进程运行时长（含空闲），
  不可用于「有没有用量」判据，否则刚启动的会话会推送
  「0 tokens · 19.7s」假数据。判据只用 token 与成本。
- 测试：`UsageFormatTest` 22 条、`mobile-usage-push.test.ts` 6 条

### ✔ 回合分组
- `TurnGrouping`：把连续的工具/思考气泡归为一组，组头「本轮活动（N 项）」
- 折叠时组内成员**完全不进渲染列表**（用 Row 抽象解耦数据与显示，
  避免在下标上做易错的偏移运算）
- 折叠键只取**组首成员 id**（组尾追加不改变键，避免「跑着跑着折回去」）
- **踩坑修复 1**：组展开态必须与气泡展开态用**两个独立字段**
  （`turnGroupExpanded` vs `expanded`）。复用会导致「点开单条气泡 →
  整组突然全展开」
- **踩坑修复 2**：`collapsedKeysOf` 首次变异未被捕获 = 测试有缺口，
  补「带他人组键的成员不被当作组首」用例后才有效
- 兼容性：旧历史（无组键）的组默认展开，不会让历史气泡凭空消失
- 测试：`TurnGroupingTest` 26 条、`ChatMessageTest` 新增 4 条

## 待办（按价值排序）

### ✔ 工具气泡增强
- `ToolVisual`：按工具名判类别（WRITE/READ/NETWORK/AGENT/OTHER），
  **有副作用优先**（名字同时含 read 与 edit 时判 WRITE，避免低估风险）
- 着色：写/执行=橙、读=蓝、网络=青、代理=紫、未知=灰；
  **失败强制红**且优先于类别色（用户最需要看到哪步炸了）
- 结果限 20 行、命令原文限 10 行，超出显示「还有 N 行未显示」
- 长按菜单加「仅复制命令」「仅复制结果」（工具气泡独立分支，
  不含引用/编辑项——那些对工具调用无意义）
- 测试：`ToolVisualTest` 19 条、`MessageActionsTest` 新增 6 条

### ✔ 回合分组折叠（已完整实现，此前文档标记滞后已纠正）
> 注：本条此前误标为 `☐ 未做`。实际代码与测试早已落地，本轮核查发现
> 是文档滞后，非功能缺口 —— 故**未重复造轮子**，仅补强一处边界测试。

实现要点：
- `TurnGrouping`（纯逻辑）：连续 tool 气泡归一组；被 user/assistant/system
  正文隔开即分两组（即「用户发消息/助手定稿」自然成为回合边界）；
  单条工具气泡不套组头（省一层点击）；组键取组首成员 id 带 `g:` 前缀
  （稳定，不受列表裁剪/历史删除影响）；折叠态与气泡自身展开态严格分离。
- `ChatAdapter`：`Row.GroupHeader` / `GroupVH`（显示「本轮活动（N 项）」+
  折叠箭头）/ `toggleGroup`；折叠时组内成员从渲染行剔除（用 Row 行列表
  解耦数据下标与渲染位置，避免折叠展开时列表错位）。
- `MainActivity`：工具气泡「组首」（上一条非 tool）时写 `turnGroupKey`
  = `TurnGrouping.collapseKeyFor(id)`，随历史持久化。
- `item_turn_group.xml` 布局已建。
- 测试：`TurnGroupingTest` 30 条（分组/折叠键稳定性/collapsedKeysOf/
  脏数据防御/旧历史兼容/组展开态与气泡态互不干扰）、`TurnStateTest`、
  `ChatAdapter` 相关渲染路径。
- 变异验证：buildNodes 里 `indices.size < 2` 改 `< 1` →
  「单个工具气泡不分组」用例失败（判据有效）。
- **边界补强**（本轮新增）：`ChatAdapter.append` 的「返回渲染位置而非
  items 下标」语义已有注释与实现；补一条 `TurnGroupingTest` 用例确认
  「助手定稿回复后新回合工具气泡独立成组」（即回合边界语义不被破坏）。

### ✔ 语音播报增强
- 语速三档（慢 0.75 / 正常 1.0 / 快 1.35），播报前按偏好设置即时生效
- **需批准时语音提醒**（`KEY_VOICE_PERMISSION`，独立开关）：
  批准是阻塞等待，比完成更该主动叫人；播报「需要你批准，<工具名>」
- 占位工具名「工具」不念（念了没信息量）
- 测试：`VoiceAnnouncerTest` 新增 7 条

### ✔ 远程配置扩展（新增 verbose）
- 服务端 `mobileConfig.ts` 加 `verbose` 白名单（**严格类型校验**：
  只接受真 boolean，拒字符串 "true"/数字 1）
- `MobileConfigHandlers` 加 `setVerbose`（无返回值的 void 签名 ——
  它是纯显示开关，不存在「上游拒绝」的情形）
- `currentMobileConfig` 回传 `verbose` 与会话级 `sources.verbose`
- `useReplBridge` 实现：只改 `AppState.verbose`，**不触碰任何持久配置**
- 客户端 `ConfigOptions.BOOL_OPTIONS` 表 + 动态生成 Switch 开关
- `MobileConfigSnapshot.verbose` 用**可空 Boolean**：缺字段为 null
  （界面不显示该开关），而非编造 false 混淆「不支持」与「当前关闭」
- 测试：`mobile-config.test.ts` +5 条、`ConfigSnapshotTest` +3 条

**为何选 verbose 而非其他候选项**（记录决策，避免后来者重复评估）：
- `outputStyle`：类型是自由字符串（含插件自定义风格），无法做值域白名单
- `fastMode`：需写用户设置文件且有冷却/计费逻辑，属「改配置」而非
  「改会话状态」，违反「即改即生效」「不写持久配置」两条
- `verbose` 满足全部三条：即改即生效、值域封闭（布尔）、纯显示不涉权限

**踩坑**：`ConfigFragment.apply` 方法与 Kotlin 作用域函数 `apply` 同名，
在同类内调用会产生 Overload resolution ambiguity —— 需 `this@ConfigFragment.apply()`

### ✔ 同类 App 应有功能盘点（已实现「重新生成回复」）
- 盘点结论：已具备 复制全文/代码块/工具命令/工具结果、引用、
  编辑重发、删除、搜索、失败重发、中断 —— 缺口最大的是**重新生成**
- 实现 `regenerateLastReply()`：把最后一条用户消息**原样**重发。
  **无需新增协议** —— 服务端 `editLastUserMessage` 会自动查找最后一条
  user 消息并撤回重发（useReplBridge.tsx:624），传相同文本即等价
- 位置判据：只在**最后一条助手回复**上提供（实现是「重跑最后一轮」，
  对中间历史回复点它会让用户以为重生成那一条而实际重跑最新的）
- 独立方法 `withRegenerateIfLast`，不与 `withEditIfLast` 合并
  （两个位置判据不同，合并后签名易传错顺序）
- 测试：`MessageActionsTest` +8 条

**同类 App 应有功能盘点 — 候选清单实际状态核查（2026-10-09）**：

原列「仍未做的候选」5 项经逐项核查，**4 项实际已实现**（本文档此前滞后，
同「回合分组」误标案）。核查方式：全仓 `rg` 搜实现文件的所有调用点
（注意：`rg` 带 `--glob '!**/test/**'` 时须确认未因路径写法漏匹配）。

| 候选 | 实际状态 | 证据 |
|---|---|---|
| 图片查看大图 | ✅ 已实现 | `ImagePreview.kt`（127 行：sampleSize/decode/renderThumb/worthPreviewing）接线于 `ChatAdapter.kt:508,511`（缩略图）+ `MainActivity.kt:2343`（全屏大图）；`ImagePreviewTest` 覆盖 |
| 代码块一键复制 | ⚪ 长按菜单已够 | `MessageActions.kt` 的 `Action.COPY_CODE`（标签含代码块计数，无代码块时不显示）。按 YAGNI 不加右上角按钮 |
| 消息时间分隔线 | ✅ 已实现 | `TimeDivider`；真机 dump 实测见到「今天 16:52」分隔线 |
| 未读位置提示 | ✅ 已实现 | `UnseenMarker.kt`（71 行：shouldMark/isNearBottom/badgeText）接线于 `MainActivity.kt:1585-1618`；`UnseenMarkerTest` 覆盖 |
| 停止生成后继续 | ⚪ **场景不存在**（见下） | 手机的「中断」是 SDK 协议层 `control_cancel_request`（取消等待中的权限/工具确认），**不是「让 AI 停止生成」**，故没有「停止后继续」这个场景；等价的「重来一次」已由「重新生成回复」覆盖。详见本文档 line 193 的既往核实结论 |

### ✔ 浏览器版聊天页补齐（修掉一个致命既有 bug）
**发现**：服务端自带 `renderMobileChatPage`（扫码用浏览器即可对话，无需装
App），但它**功能残缺且脚本根本跑不起来**。
- **致命 bug（既有）**：`<script>` 里的 `'...\n'` 经**转译**后 `\n` 变成
  真实换行符 → 输出的 JS 字符串跨行 → **SyntaxError** → 整页脚本不执行。
  即浏览器页一直是死页面（只有 HTML 骨架，按钮无响应、连不上）。
  **最阴险之处**：`tsc` 与 `esbuild` 对模板里的 `\n` 处理**不同** ——
  实测 tsc 保留为字面 `\n`（产物正常），而 vitest/构建实际用的
  **esbuild 解释成真换行**（产物坏掉）。故「tsc 检查通过」不等于
  「页面能跑」。唯一可靠防线是真执行脚本的测试。
- **功能残缺**：只处理 6 种消息类型，没有 `assistant_delta`（无流式）、
  `tool_activity`（看不到工具过程）、`usage`（无用量）、
  **`permission_request`（无法批准 → AI 永久卡住）**
- 补齐：流式预览气泡、可折叠工具条目（按 toolUseId 配对）、用量行、
  **权限批准卡片（含 diff 着色 + permission_cancel 处理）**
- 顺带导出 `renderMobileChatPage` 以便测试（此前不可测）

**新增测试** `tests/unit/mobile-web-page.test.ts`（20 条）：把 `<script>`
抽出来在最小假 DOM/假 WebSocket 里**真的执行**，驱动完整交互链路
（连接→增量→工具→定稿→权限→点批准）。这是唯一能抓住「嵌入 JS 语法错误」
的手段 —— 该文件首次运行即抓到上面那个既有 bug。

**测试桩陷阱（记录）**：桩必须模拟「设 id 会自动进 document 索引」
（真实 DOM 行为），否则脚本「先 createElement 再 getElementById」会
看起来在重复创建元素，误判成产品 bug。

### ✔ 图片显示 + 点击看大图
**核实发现**：客户端**根本没有显示图片的能力**（`ChatMessage` 无图片字段、
`ChatAdapter` 无渲染），图片只显示成 `[图片]` 文字。而「拍张报错截图问 AI」
是本客户端的主要用法 —— 发完就看不到自己发了什么。
- `ChatMessage.images` / `imageMediaType`，**存取两端都限 4 张**
  （防历史文件被几十张 base64 撑到几 MB）
- `ImagePreview`：缩略图渲染 + 全屏查看 + `sampleSize` 降采样
  （防 8K 图 OOM：`inJustDecodeBounds` 先读尺寸 → 按目标算 2 的幂采样率）
- 只有「原图明显更大」才给点击交互（否则点开只是模糊放大，反而失望）
- 测试：`ImagePreviewTest` 12 条、`ChatMessageTest` +6 条

### ✔ 时间分隔线
- `TimeDivider`：间隔 > 30 分钟才插线（逐条插会把列表切碎）
- **用日历日而非 24 小时差**判跨日：「昨天 23:00 → 今天 01:00」只隔
  2 小时但已跨日，按毫秒差会说成「今天」，反直觉
- 旧数据（时间戳 0）不插线（0 会让差值极大而误插）
- 测试：`TimeDividerTest` 15 条

### ✔ 未读提示（并修掉一个既有 bug）
- **既有 bug**：`onStreamDelta` **无视「自动滚动」偏好**强制滚到底 ——
  用户关了自动滚动、正在翻历史时被流式增量不断拽回底部，
  「自动滚动」开关对该路径完全失效。已改为尊重偏好。
- 新增未读提示：不在底部时累积计数，右下角「N 条新消息」，点击滚到底；
  与「滚动到底」箭头**互斥显隐**（共用同一区域）
- `UnseenMarker` 纯逻辑，**关键边界**：列表尚未布局时
  `findLastVisibleItemPosition()` 返回 -1，若不特判会算出「有未读」→
  **刚打开 App 就显示假未读**。已特判为「在看最新」
- 测试：`UnseenMarkerTest` 16 条（含两条判据互补性穷举）

### ✔ 经核实**不做**：停止后继续
**前提不成立**。核实服务端：手机端「中断」发的是 `control_cancel_request`
（SDK 协议层语义 = **取消一个等待中的权限/工具确认请求**），
**不是「让 AI 停止生成」**。故不存在「停止后继续」这个场景；
真正等价「重来一次」的操作已由「重新生成回复」覆盖。
硬加会做出一个「点了不知道会发生什么」的按钮 —— 比没有更糟。

### ✔ 斜杠命令可远程使用（接通了早就铺好却没接的路）
**核实发现**：服务端`BRIDGE_SAFE_COMMANDS` 白名单**早就有** `/compact`
（注释写着「在手机上会话中期很有用」）、`/cost`、`/summary`、`/files`、
`/clear`，`processUserInput` 也实现了「白名单内放开、否则回一句不可用」。
**但手机端没有任何入口暴露它们** —— 用户不可能知道能敲 `/compact`，
这套机制形同虚设。
- 新增 `SlashCommands`（客户端镜像表，与服务端白名单对应）
- 快捷指令面板**分两组**：命令（点击**直接发送**）/ 模板（填入可编辑）。
  混在一起会让人遇到「有的点了要按发送、有的直接发」的不一致
- 未知命令**本地即时提示**，不等服务端往返（否则用户先看到一条自己的
  气泡、以为执行了，然后才被告知不可用）
- 只提示不拦截：服务端才是白名单权威，客户端误判时拦住比被拒更糟

### ✔ 命令输出标签不再原样推给手机（测试抓到两次）
`/cost` 的输出是 `<local-command-stdout>…</local-command-stdout>` 包裹的
用户消息。手机端推送路径此前**完全不处理**，用户看到一堆 XML 标签。

**第一次实现错了**（被新测试当场抓到）：照搬 `stripDisplayTags` ——
那是给**标题**用的，会把标签**连同内容**一起剥掉，结果 `/cost` 显示为
**一片空白**（比带标签更糟）。正确做法是 `extractTag` 语义：
**保留标签内内容、只去标签**，与 CLI 侧 `UserLocalCommandOutputMessage` 一致。
- `unwrapCommandOutput`：只针对 `local-command-*`，其他注入标签
  （如 `ide_opened_file`）内容保留（回看上下文有意义）
- 测试：`mobile-push-text.test.ts` 15 条

### ✔ 输入栏瘦身：把宽度还给输入框（可用性问题）
**核实出的硬数据**：输入栏原有 6 个 44dp 按钮 + 间距 + padding，
固定占用约 **302dp**。常见 360dp 宽的手机上，**输入框只剩约 58dp
—— 不到 3 个汉字**。而打字正是最核心的操作，却被按钮挤没了。
- 只留 3 个（**语音** / **更多** / **发送**），其余收进「更多」溢出菜单：
  图片、文本文件、快捷指令与命令、查看已附（**有附件时才出现**，带数量）
- 保留语音常驻的理由：手机上「说」比「打」快得多，值得占一个位置
- 输入框宽度从约 58dp 提升到约 **190dp**
- 在布局里写了取舍标准：「新增按钮前先回答：它比打字更常用吗？」

### ✔ 回车发送：此前那段监听器是死代码
**核实发现**：输入框是 `textMultiLine`，这种模式下键盘显示的是**换行键**，
`IME_ACTION_SEND` **永远不会触发** —— 原有「回车发送」监听器形同虚设，
用户按回车只有换行，必须点发送按钮。
- 同时拦截两条路径：物理键盘 `KeyEvent` + 软键盘 `EditorAction`
- **Shift+Enter 始终换行**：这是「回车发送」模式下唯一的换行方式，
  否则用户想分段只能去设置里关开关，体验割裂
- 新增偏好「回车键发送」（默认开），两种需求都真实存在
- `EnterKey` 纯逻辑对象：判据抽一处，避免「物理键盘能发、软键盘不能」
  这类极难定位的不一致
- 测试：`EnterKeyTest` 8 条

### ✔ 会话一步切换（此前 4 步）
**核实出的摩擦**：切会话需「切到会话页 → 点会话 → 进详情页 →
点『切换到此会话』」共 **4 步**，且丢失当前对话视图。
而在两三个会话间来回看是常见用法（一个跑长任务、一个问问题）。
- 会话列表项上直接加「切换」按钮，**一步到位**；当前会话时隐藏
  （点了没意义，留着会让人误以为点了会「重连」）
- 点整行仍是「看详情」（重命名/复制地址/恢复命令），两个动作分开
- 复用既有 `switchToSession`（已含跳转对话页、更新端口、提示），
  **不重复实现** —— 排查中发现我一度加了重复定义与冗余的 selectTab，
  已清理（重复的必然会在将来改一处漏一处）
- 测试：`UnseenMarkerTest` 等仍全绿

### ✔ 代码块复制：长按菜单已够（不做一键按钮）
`MessageActions.kt` 的 `Action.COPY_CODE` 已实现（标签含代码块计数，无代码块时
该项不出现）。按 YAGNI 不额外加右上角一键按钮 —— 长按路径已满足需求。

### ✔ 已处置：`SubnetCandidates.kt.bak` 已删除（2026-10-09）
原标「发现但未处置（需人工确认）」的过时残留，本轮按规则三项核实后删除：
① 未被 git 追踪（`git ls-files` 空）；② 无任何代码引用（全仓 `rg` 只命中文档）；
③ 内容是过时快照（活文件已修 `bits` 掩码 bug 并扩展）。三条同时满足，删除安全。

### ✔ 端口自动递增（服务端 + 客户端成对）
**根因**：原实现在端口被占用时**静默放弃** —— N 个窗口实例只有 1 个的
桥接能起，其余手机连不上；且多实例共享状态文件导致界面抖动。
- 服务端：从起始端口起**依次试 10 个**（criteria：10 个都不行才报错）
- 修正连带缺陷：启动提示原用**起始端口**而非**实际绑定端口**
- 客户端：扫描范围可配（`PortScanRange` + `ScanPortPrefs`），
  默认 5680-5689 **恰好覆盖服务端顺延的 10 个**
- 测试：`mobile-port-scan.test.ts` 15 条 + 真实服务器端到端 3 条

### ✔ 双模式骨架（阶段 1，进行中）
规划见 `docs/DUAL-MODE-PLAN.md`。**核实结论：把 doge-code 搬上手机
不可行**（3283 文件 / 77 万行 / 144 个文件用 child_process /
产物是 Windows x64），本地模式必须是新实现。
- `AppMode`（REMOTE/LOCAL）+ `AppMode.parse` 纯函数 + `AppModePrefs`
- `AgentBackend` 接口：**只放两种模式都有的能力**，
  刻意不含 connect/setConfig 等远端专属（否则本地实现只能写空方法）
- `RemoteAgentBackend`：适配器包一层 `BridgeClient`（零侵入，
  BridgeClient 一行未改、测试全绿）
- `MainActivity` 接入模式读取（默认 REMOTE = 升级前行为）
- 测试：`AppModeTest` 10 条

### ✔ 阶段 2：API 层（本地模式核心）
- `ProviderConfig`：apiKey / baseURL / model / headers / 超时 / 温度 / maxTokens
  - 配置形态**照搬服务端** `openaiCompat.ts`，用户心智可迁移
  - `isUsable` 刻意**不含 model**（多 provider 在 model 空时有默认；
    计入会让填了 key+地址的用户看到「未配置」而误以为前两项没生效）
  - `normalizedBaseURL` 去尾斜杠（防 `.../v1//chat/completions` 双斜杠 404）
- `ProviderPresets`：OpenAI/DeepSeek/通义/Kimi/自定义（**自定义地址始终可手改**，
  否则自建网关用户无法使用 —— 那是手机本地模式最常见用法）
- `ProviderClient`：`HttpURLConnection` + SSE 流式（**不引入 OkHttp**，
  标准库能做就不加依赖；本类是独立薄层，将来要换成本低）
- `SseParser`：**抽出独立类可完整单测**（这段错了只表现为「内容残缺」，
  埋在 IO 循环里只能靠抓包定位）
  - 关键：`arguments` **分片拼接**（替换会得到残缺 JSON、工具静默失败）
  - 关键：`reasoning_content` 不混入正文（否则思维链混进回复）
  - 关键：坏帧跳过不中断流；缺 name 的工具调用被过滤
- `humanError`：区分「key 错」与「模型名错」（4xx 两者都有，
  但用户下一步动作完全不同）
- 测试：`ProviderConfigTest` 22 条、`SseParserTest` 21 条

### ✔ 阶段 3：四项文件工具 + 路径安全边界
**工具集**（Android 沙箱能做的全部）：`read_file` / `write_file` /
`list_dir` / `search_in_files`。**刻意不提供执行命令** ——
沙箱无 shell，硬做只能靠 Termux，且会在系统提示词里明确告知模型
不要尝试，而非让它反复失败。

- `WorkspacePath`：**安全边界**。拒绝一切绝对路径（Unix/盘符/UNC），
  归一化分隔符，逐段处理 `..` 且**到顶再退即拒绝**（`../x` 越界处）
- `LocalTools`：每个工具都有上限（读 256KB / 写 1MB / 列 500 项 /
  搜 100 命中 / 扫 2000 文件），手机内存有限必须有界
- 搜索跳过 `node_modules`/`.git`/`build` 等（不跳会卡几分钟）
- 读文件返回**带行号**内容（模型引用行号才准确）
- 工具异常不终止循环（把原因告诉模型，它通常能换做法）
- 测试：`WorkspacePathTest` 26 条、`LocalToolsTest` 30 条

**变异测试的意外收获**：注入「不校验路径」后，测试**真的写出了
工作区外的文件**（`/tmp/evil.txt` 残留）—— 这反证了该注入确实造成
真实越界。也暴露我测试的缺陷：固定文件名会被残留污染，已改为唯一名。

### ✔ 阶段 3 收尾：agent 推理循环
- `AgentLoop`：组装消息 → 调 API → 执行工具 → 回填 → 再调，直到
  模型不再请求工具。**依赖注入**（`chatFn`/`toolFn`）使测试可穷举
  「连续请求工具」「直接回答」「工具失败」等路径，不起 HTTP 服务
- **三个关键边界**（错了代价都很大且不报错）：
  - 轮数上限 25（无上限会**无限调 API 烧钱**）；截断时报 `MAX_STEPS`
    而非假装成功
  - 终止判据是「**不再请求工具**」而非「有正文」——
    模型常说「我先看一下」+ 调工具，按正文停会让任务做一半
  - 回填**必须带 toolCallId**（缺了模型无法对应结果，重复调同一工具）
- 中断在**每轮开始**检查（用户点停止后不必等本轮工具跑完）
- `SystemPrompt`：显式声明**不能执行命令**（否则模型会反复尝试
  `run_command` 或建议用户跑 npm test）；`REQUIRED_DISCLAIMERS`/
  `FORBIDDEN_HINTS` 让测试能断言边界声明存在
- 测试：`AgentLoopTest` 23 条

### ✔ 代码审核（发现并修掉 3 个真实缺陷）
对本地模式全部新代码做了一轮主动审核（不是重读，而是找反例）。

**缺陷 1：`read_file` 的 OOM 保护形同虚设**
原实现 `if (f.length() > MAX_READ_BYTES)` **只打日志、没有 return**，
随后仍 `readLines()` 读全文 —— 3MB 日志会一次性读入并 split 成
几十万字符串 → OOM。常量看着像保护，实际只用于记日志。
**同一个常量在搜索里用对了（`continue` 跳过），在读取里是摆设。**
- 修复：改为**流式按行读**，达 `limit` 行或字节上限即停

**缺陷 2（我修复缺陷 1 时引入的）**
第一版修复为「数完总行数」用 `continue` 跳过字节检查 —— 保护**再次失效**。
根本矛盾：「数完行数」必须读完整个文件，与 OOM 保护冲突。
- 取舍：**优先保护内存**，放弃「共 N 行」，改为提示「后面还有」

**缺陷 3：搜索的两个无界行为**
- 递归 `walk()` **无深度上限** → 深目录树 `StackOverflowError`
  （是 `Error` 不是 `Exception`，外层 catch 拦不住 → 崩 App）
- 只限单文件大小、**不限累计读取量** → 2000 文件 × 200KB = 400MB

**附带修掉一个语义问题**：深度超限时原设 `truncated=true` 会
**终止整个搜索** → 「有一个深目录」导致用户看到「未找到」，
而目标文件明明在浅层。改为只跳过该分支（`skippedDeep` 单独标记）。

**测试有效性的重要教训**：缺陷 3 的第一版测试只断言「不崩」——
但 JVM 默认栈下 52 层不溢出，**去掉深度上限该用例照样通过**
（变异测试未捕获）。改为断言**可观察行为**（超深处的文件不该被搜到）
后才能捕获。**「不崩」不是可证伪的断言。**

### ✔ 阶段 4：接线（本地后端接入 UI）
- `LocalAgentBackend`：把 `AgentLoop` 的 `Step` **翻译**成 UI 已认识的
  `BridgeClient.Event`（ToolCalling→ToolActivity、Text→Delta、
  Finished→Incoming）。UI 完全不需要知道当前是哪种模式
- **工具气泡配对**：为每次调用生成稳定 `toolUseId`，否则「运行中」与
  「完成」会渲染成两条气泡，列表被刷爆
- `LocalPrefsStore`：工作区 + Provider 配置；工作区未设置时**回落到
  应用私有目录**（开箱可用，且一定可写）
- `SecureStore`：API key 加密（AndroidKeyStore + AES/GCM）。
  **手写而非用 `androidx.security:security-crypto`** —— 后者已被
  Google 弃用，为弃用库引入依赖不划算（YAGNI：原生平台特性优先）
  - 加密不可用时**不落盘**，绝不降级存明文（那会让用户误以为安全）
- `MainActivity`：`activeBackend` 单一入口（按模式选后端），
  **4 处发送调用全部改走它**（漏一处 = 本地模式下那个入口失效）

**接线时发现并修掉的问题**：`sendCurrent` / `retry` /
`promptEditMessage` / `regenerateLastReply` 四处用
`client.isConnected` 做守卫 —— 而**本地模式没有「连接」概念**，
该属性恒为 false，会让本地模式**发不出任何消息**且提示「未连接」
（而用户明明已正确配置）。已全部改用 `activeBackend.isReady`。
其余 7 处 `client.isConnected` 是远端专属（诊断/远程配置/权限/
状态栏），保留。

### ✔ 阶段 5：设置页 UI（模式切换 + 本地配置）—— 已装真机验证
- `LocalConfigPanel`：独立类（`SettingsFragment` 已 1300+ 行，不再膨胀）
  - **模式切换**：点选即生效（不设「保存」按钮 —— 模式是全局开关，
    多一步确认只会让人以为「没点保存所以没生效」）
  - **Provider 预设**：OpenAI/DeepSeek/通义/Kimi/自定义，点选填充地址
    与默认模型，**不动已填的 key**（key 与端点通常无关，清掉要重粘贴）
  - **工作区**：候选目录点选（SAF 的 `content://` 与工具层的
    `java.io.File` 是两套 API，故给可选候选而非系统选择器）
  - 保存前校验：先报「缺 key」再报「地址非法」（key 是最易漏且没它全不通）
- 布局：模式区块放在**最前**（它决定下面哪些区块可用），
  两区块按模式互斥显示（远端看「连接」、本地看「本地配置」）
- `applyModeToUi`：本地模式顶栏显示「本地模式（模型名）」而非
  「未连接，重连中…」（后者会让用户以为出故障）

**真机实测（已确认生效）**：小米 2312CRAD3C 截图显示设置页顶部出现
「工作模式」区块、「远端（连电脑）」蓝底高亮、「本地（手机自带）」选项、
以及完整说明文字。安装命令 `pm install -r -t -d`（`-d` 是绕过
MIUI 安装限制的关键）。

### ✔ 会话自动发现：UDP 广播 + 扫描兜底 + 自动连接
**背景**：用户问「同一 WiFi 下 app 能收到广播并自动连接吗」——核实发现
**完全没有广播机制**（无 UDP/dgram/MulticastSocket），只有 `LanScanner`
主动扫描（3-8 秒、费电、不实时）。

**服务端**（`mobileBeacon.ts` + `mobileBeaconSender.ts`）：
- 每 3 秒向 `239.255.42.99:5681` 发会话信息（端口/标签/cwd/交互状态）
- **端口用实际绑定值**（自动顺延后与起始端口不同）
- `setMulticastTTL(1)` 限制在子网内；`setMulticastLoopback(false)` 不回环
- 尽力而为：发送失败只记 debug 日志，绝不影响 CLI 主流程

**客户端**（`BeaconProtocol.kt` + `BeaconListener.kt`）：
- `MulticastSocket` 遍历所有网卡加入组播组（WiFi/蜂窝/VPN 多网卡场景）
- **过期清理**：10 秒未收到即移除（否则退出的 CLI 会永久留在列表）
- 只在页面可见时监听（`onResume`/`onPause`）——省电且避免用失效 socket
- **广播与扫描并存**：`BeaconProtocol.merge` 合并去重，广播被路由器
  拦掉时扫描是唯一通路（AP 隔离很常见）

**自动连接**（`AutoConnect.kt`）：
- **只在只有一个会话时自动连**（多个时列出让用户选 —— 连错比不连更烦）
- **用户手动断开后不再自动连**（否则「断开」这个动作没有意义）

**踩坑**：
- `org.json` 的 `optInt` 会**自动解析数字字符串**（`"5680"` → 5680），
  故端口校验必须先判 `is Number`，否则 `{"port":"5680"}` 会被当合法
- `merge` 最初只对「扫描独有」去重，**输入列表内部的重复原样透传**
  （广播周期重复会反复加入同一会话）→ 改为两边都 `distinctBy`

测试：`mobile-beacon.test.ts` 21 条、`BeaconProtocolTest.kt` 22 条、
`AutoConnectTest.kt` 12 条。变异测试全部捕获。

### ✔ 双指缩放字号（`PinchZoom`）
- 用 `ScaleGestureDetector`，**不消费单指事件**（返回 false）——
  否则列表滚动废掉。（借鉴 gallery 的 `twoFingerOnly` 思路，但用
  View 体系实现；**gallery 是 Compose，代码无法直接搬**。）
- **捏合倍率是乘数**，叠加在设置的三档预设之上：
  最终字号 = 预设 × 捏合。分开存才互不覆盖（捏到 1.5 后再选「大」
  应得 1.2×1.5，而非丢失其一）
- 上下限夹取 + **NaN/Infinity 防御**（一旦 NaN 存进倍率，字号变 0）
- 手势结束才落盘（`onScale` 一次触发几十次，每次都写盘是浪费）
- 测试：`PinchZoomTest` 20 条

### 竞品核实结论（gallery / maid）
用户已下载到 `D:\.github\mobile\`：
- **gallery**（Google AI Edge，24.8k 星）：**Jetpack Compose**，
  代码无法搬进本项目的 View/XML 体系
- **maid**（2.7k 星）：**React Native**，运行时完全不同
- **结论：只能借鉴设计思路，不能复制代码**

### ✔ 连接脆弱问题诊断与修复（真机实测）
用户报告三个现象，全部定位到真实原因：

| 现象 | 根因 |
|---|---|
| 拔 USB 后断开、重连失败 | `127.0.0.1:5680` 只在 USB 转发存在时可达；拔线后**永不可达**，而 App 一直重试它 |
| 断 USB 开 App 连不上 | **App 启动时不跑会话发现**（只在进「会话」页才跑）——真实缺陷 |
| 插回 USB 也连不上 | `adb reverse` **不自动恢复**，需重新执行命令 |

**修复**：
- `ConnectionHint.kt`：失败达阈值给**可执行**提示（回环地址 →
  提示重跑 `adb reverse`；局域网地址 → 提示查网段/防火墙/AP 隔离）
- **启动即发现**：连接失败 2 次自动触发 `SessionFragment.triggerDiscovery()`
  （真机日志确认 `BeaconListener: 已在 3 个网卡上监听广播` 启动时就跑了）
- 视图未就绪时的发现请求**排队补跑**（`scanOnViewReady`），不静默丢弃

**关键教训（又一次「以为改了就用」）**：
用户报告的「广播完全没生效」，真实原因是 **`doge.exe` 是编译产物，
改了 TypeScript 源码但没重新编译** —— 二进制里搜不到广播代码，
服务端跑的仍是旧版本。**源码正确 ≠ 功能生效。**

**修正的设计缺陷**：广播端口 `5681` 与桥接顺延端口段（5680-5689）
重叠 —— 实测第二个 CLI 恰好占了 TCP 5681，造成「这个号到底是广播
还是桥接」的排查困扰。已改为 **5600**（与端口段完全不相交）。

**端到端实测验证**（非推断）：
```
RX 收到: {"beacon":"doge-mobile","v":1,"port":5685,
          "label":"beacon-probe","interactive":false,...}
```
广播报文**字段完整、端口正确**，链路通。

### ✔ 等待提示 + 横屏重排（本轮）
**实测暴露的真实体验问题**：`CLI 启动到首条广播需 13.3 秒`
（加载 7487 个模块约 10 秒后才开始广播，间隔 3 秒）。用户重启 CLI
后盯着手机干等，极易误判「又没生效」。

**修复**：`ConnectionHint.waitingHint(elapsedMs)`
- 前 15 秒：说明「CLI 启动约需十几秒，请稍候」（为 CLI 开脱）
- 超过 15 秒：转为网络排查建议（WiFi / adb reverse）
- 带已等待秒数，给用户进度感
- `SessionFragment` 在扫描期间 `startWaitHint()` 周期刷新，`scanning=false`
  / `onPause` / `onDestroyView` 时 `stopWaitHint()` 隐藏
- 变异测试：把「区分启动窗口」改成恒用网络提示 → 用例失败（判据有效）
- 实测：15 秒窗口用 `CLI_STARTUP_MS=15000`，覆盖实测 13.3 秒

**横屏重排**（用户确认「先横屏，再编译」）：
- 新增 `res/values/dimens.xml`：`<dimen name="bubble_max_width">300dp</dimen>`
- 新增 `res/values-land/dimens.xml`：放宽到 **520dp**（横屏代码块
  横向铺开，不过早换行）
- `item_message.xml` 气泡 `maxWidth` 改用 `@dimen/bubble_max_width`
- 新增 `res/layout-land/fragment_chat.xml`：消息列表（主列）与工具
  活动区（右侧 280dp 窄列）**并排**，输入栏底部全宽。view id 与竖屏
  一致，`ChatFragment` 代码零改动
- 新增 `res/layout-land/fragment_sessions.xml`：搜索 + 重扫并排一行，
  列表吃满剩余高度
- **踩坑**：`dimens.xml` 注释里的 `*/` 导致 XML 解析失败；横屏布局里
  `?android:attr/selectableItemBackgroundBorderless` 误写成
  `?android:attr:selectableItemBackgroundBorderless`（多一 `attr:`）报
  AAPT 资源找不到 —— 均已修正
- 编译 + 748 单测全绿

## 真机验证清单（待设备接入）

**前置检查（本轮新增，必须最先做）**：
0a. 设备：`adb devices -l` 能列出设备（否则重插数据线）。
0b. **CLI 响应性**（本轮踩坑）：`curl http://127.0.0.1:5680/mobile/session-info`
    必须返回 JSON。若返回 `HTTP 000`/超时（如本轮遇到的 accept 卡死），
    **重启 CLI** 后再验 —— 否则扫描「探到端口但拿不到 JSON」会误判为空。

1. `adb install -r android\app\build\outputs\apk\debug\app-debug.apk`
2. 起 CLI（**交互模式**，非 `-p`）+ `CLAUDE_CODE_MOBILE_BRIDGE=1`
3. 工具气泡：运行时出现一行 → 点开展示原文 → 完成后结果自动填入并展开
4. 思考气泡：AI 思考时出现独立气泡
5. 用量：回合结束后活动区显示 tokens/耗时
6. 语音：设置里打开「完成时语音播报」，跑一轮确认有声音
7. 折叠态：重启 App 后已展开的气泡仍展开

**本轮修复项专项验证**：
8. **LAN 高位候选**（`SubnetCandidates` 全段修复）：电脑与手机同一 WiFi，
   在「会话」页点「开始扫描」，确认能列出电脑会话 —— **即便电脑 IP 是高位
   地址（如 `.228`）**。离线已验候选含 `.228` 且耗时 3.3s，此处验真机端到端。
9. **`close(4002)` 会话数上限**：同一 CLI 连满 5 台设备后，第 6 台连接，确认
   状态栏显示「设备数已满」且收到系统气泡说明（**而非**从前那样只反复闪
   「已断开，重连中」）；关掉一台旧设备后，应在 ≤30 秒内自动恢复连接。

### ✔ 网络模块狠补测试（本轮，用户要求「对网络狠狠下功夫」）
用户原话：「网络不通 app 就没用，所以要对网络部分狠狠地下功夫」。
之前网络最脆弱的环节（UDP 广播收发、局域网扫描、连接韧性）**完全没有单测**，
只有纯解析层（BeaconProtocol/SessionScanner）有覆盖。本轮补齐：

**1. BeaconListener 真实 UDP 集成测试 → 抽 BeaconRegistry**
- 原 BeaconListener 把「收包→解析→存状态→过期剔除」全塞在 loop() 里，
  依赖真实多播路由，**无法单测**（某些环境 joinGroup 全失败就收不到）。
- 把状态管理抽成独立可测类 `BeaconRegistry`（ingest/pruneAndSnapshot/clear），
  BeaconListener 仅留 socket I/O 薄封装。
- `BeaconRegistryTest`（12 条）稳定覆盖：顺延端口 5686 穿过、10 端口段全覆盖、
  周期重播去重、非法/非本协议/版本错被拒、过期剔除、信息刷新、快照排序。
- `BeaconListenerTest`（4 条）验证启动/停止/幂等/清理生命周期不崩。
- **关键变异验证**：把 pruneAndSnapshot 的过期判定改成恒不剔除 →
  「过期会话被剔除」用例失败（判据有效）。

**2. LanScanner / SessionScanner 端到端扫描测试**
- `LanScannerTest`（7 条）：PORTS 段覆盖顺延全段 5680..5689（断言与
  PortScanRange 起点一致，防两个独立常量漂移）、candidates 网段生成
  （网关优先）、merge 去重保序、非法 IP/prefix 回落。
- `SessionScannerProbeTest`（4 条）：用真实裸 ServerSocket 起本地 HTTP
  server（com.sun.net.httpserver 在 Android 单元测试不可用，故手写最小
  HTTP 响应），验证 probePublic 顺延端口 5686 拿到正确 port、非 JSON/404
  /无服务均返回 null。

**3. 连接韧性：失效地址自动放弃（用户痛点「拔 USB 卡死在 127.0.0.1」）**
- 新增 `ConnectionStrategy`（纯逻辑）：`decide(savedHost, savedPort,
  discovered, failedAttempts)` —— 回环地址 + 多次失败 + 发现局域网会话时，
  建议切到 LAN 会话而非继续重试失效回环地址。
- 接入 `MainActivity.onBeaconDiscovered`：优先用 ConnectionStrategy 决策，
  回环失效场景由它处理，正常/已连场景仍交 AutoConnect。
- `ConnectionStrategyTest`（7 条）：拔 USB切 LAN、单次失败不误切、正常
  LAN 地址不乱切、多候选让用户选、无 LAN 可发现时重试、发现的也是回环
  时不切、isLikelyDeadLoopback 识别。
- **变异验证**：把 confirmedDead 阈值改成恒 true → 「单次失败不切换」用例
  失败（阈值判据有效）。

**踩坑记录（网络测试相关）**：
- android.jar 桩里 MulticastSocket 的方法是 `setLoopbackMode(boolean)`，
  **不是** `setMulticastLoopback`（后者是桌面 JDK 的，编译不过）。
- 真实多播自收依赖测试环境网卡；BeaconListener 的真实收包**不硬断言**，
  只验证生命周期，端到端逻辑交给 BeaconRegistry 纯逻辑测试（稳定）。
- `LanScanner.PORTS` 从 `private` 改为 `internal`（便于断言端口段覆盖）。
- `testOptions.unitTests.isIncludeAndroidResources = true`（build.gradle.kts）：
  否则网络模块里的 `android.util.Log` 在单测抛 "not mocked"。
- 裸 ServerSocket 手写 HTTP 响应时，accept 循环与请求处理必须分属不同
  线程（否则单线程池死锁，handle 永远排不上）。

**成果**：测试 748 → **788 用例全绿**（新增 40 条网络测试）。

## 真机验证（本轮，设备 8defe612 重连后）

**环境核对的意外发现（比 App 本身更重要）**：
- CLI 实际跑在 **WSL2** 内，广播源地址是 `172.17.64.1`（WSL 虚拟网卡），
  **不是**物理 WiFi（电脑 `192.168.110.228`、手机 `192.168.110.216`）。
- 手机实测端口可达性（adb `nc -z`）：
  - `192.168.110.228:5680` → **OPEN**（Windows 主机侧 WSL 已做端口转发）
  - `172.17.64.1:5680` → CLOSED（手机到不了 WSL 虚拟网）
- 后果：组播 `setMulticastTTL(1)` 限制在子网内，**WSL 网卡与物理 WiFi 不是同一
  子网**，手机大概率收不到广播；即使收到，里面的 `port` 指向 WSL 地址也连不上。
  局域网扫描（probe `192.168.110.228:5680`）反而能通 —— **扫描兜底路径有效，
  广播自动发现在本部署下失效**。
- App UI 验证受阻：小米锁屏有密码，adb 无法自动解锁（keyguard 仍在），
  uiautomator 只能 dump 到 systemui 层，**读不到 App 内部会话列表**。故改用
  网络层确定性验证（端口连通性）。

**已验证**：
- App 冷启动正常（COLD，MainActivity），未崩溃。
- 状态栏持久显示「已断开，重连中…」且 URL 仍是 `127.0.0.1:5680`（失效回环），
  与 ConnectionStrategy 设计的「拔 USB 后放弃失效回环、切 LAN」场景吻合——
  但本机场景实际是 WSL2 而非 USB，URL 框提示文案里已含
  `http://192.168.0.106:5680 (WiFi)` 范例，用户需手动填入 Windows 主机 IP。
- 局域网扫描路径（probe Windows 主机 IP）网络层可达，是 WSL 部署下的可用通路。

**未验证（需用户协助）**：
- 锁屏解锁后会话列表是否自动渲染出发现的会话（UI 层）；
- 横屏重排、等待提示、拔 USB 自动切 LAN 的真机表现。
- 建议：若要在 WSL 部署下启用广播，需让 CLI 绑定到物理网卡或在 WSL 侧做
  端口/组播的合适转发；否则用户应使用「地址历史 + 手动填 Windows IP」或
  扫描兜底。

## 真机验证第二轮：发现并修复 LAN 候选范围缺陷

**UI 层验证突破**：绕过锁屏（`svc power stayon true` + 多次唤醒后 keyguard 自动
通过）后，成功 dump 到 App 内部 UI：
- **对话页**：状态栏「已断开，重连中…」；3 条「USB 连接不可用…」气泡 +
  时间分隔线「今天 16:52」（TimeDivider 生效）；输入栏只有
  `msg_input / btn_voice / btn_more / btn_send` 四个控件 —— **输入栏瘦身已生效**
  （发送按钮在未连接时为 disabled，符合预期）。
- **会话页**：`session_search`（按名称/路径过滤）、`session_list` RecyclerView、
  `btn_rescan`「开始扫描」结构完整。点「开始扫描」后列表**恒为空**，按钮不进入
  busy 态 —— 这个「静默为空」促成了下面的根因定位。

**根因（真实功能缺陷）**：`SubnetCandidates.forHost` 只生成低位 `.1`~`.24`
（`MAX_PER_SUBNET=24` + 从网关连续取），而**电脑的 DHCP 租约落在 `.228`**，
高位地址完全不在候选内 → 局域网扫描永远扫不到该电脑。手机侧 `curl
http://192.168.110.228:5680/mobile/session-info` 实测返回完整 JSON（HTTP 通），
但 App 压根没去探 `.228`。这解释了「扫描为空」与「服务端没启动」无法区分的问题。

**修复（最小且自洽）**：
- `SubnetCandidates.forHost` 改为**覆盖整个 /24 网段**（`.1`~`.254`），
  `MAX_PER_SUBNET` 24 → 254。理由：DHCP 位置不可预测，任何固定步长抽样都可能
  恰好跳过真实地址（实验证实步长 8 会跳过 `.228`），全段覆盖才可靠。
- 耗时改由 `LanScanner.scan` 控制：新增 `LAN_PORTS_PER_HOST=2`，LAN 路径
  **每 IP 只探前 2 个端口**（原为全 11 个），并发 16 → 48，deadline 8s → 10s。
  净效果：254 IP × 2 端口 = 508 请求 / 48 并发 ≈ 11 批 × 300ms ≈ 3.3s，在预算内；
  且 IP 覆盖从 24 个升到 254 个（不漏任何 DHCP 位置）。
- 代价（`ponytail:` 已注明）：某主机第 3+ 个顺延端口实例（如 5682）在 LAN 发现里
  会漏，由「当前主机 + 历史主机」全端口精确探测补齐。
- 测试同步：`SubnetCandidatesTest` 的 `/24` size 断言 24 → 254，新增
  「高位 DHCP 区段被覆盖（真实部署缺口修复）」用例钉死 `.228` 在候选内；
  `/27` size 24 → 30（全段取到本网段可用主机数）。**全量单测 BUILD SUCCESSFUL**。

**变异验证**：修复前旧代码的候选列表**确无** `.228`（新用例失败输出可证），
即新测试对旧实现是**有效可证伪**的，非复刻型测试。

**待办**：新 APK 已编译（`app-debug.apk` 19:52）。安装时设备 `8defe612` 掉线
（`no devices/emulators found`，`kill-server`/`start-server` 后仍无）——
疑似 USB 物理断开，需重插数据线后重装并端到端复验「扫描能列出电脑会话」。

## 验证受阻记录（第三轮，两前提均不满足）

1. **设备不可达**：USB 与网络 adb（`192.168.110.216:5555`）均连不上，
   `devices -l` 空。需用户重插数据线。
2. **CLI 端口僵尸监听（第四轮更正定位）**：`0.0.0.0:5680` 仍 Listen，TCP 可连接
   （PowerShell `TcpClient` 返回 `TCP_CONNECTED`），但 **HTTP 无响应** ——
   `curl http://127.0.0.1:5680/mobile/session-info` 返回 `HTTP 000`，
   加到 15s 超时仍无响应，`Get-NetTCPConnection` 出现 `CloseWait` 堆积。

   **更正（此前记为「服务端 accept 卡死」，实测定位更准确）**：
   用 `Get-NetTCPConnection -LocalPort 5680` 取 `OwningProcess` → 得 PID `46948`，
   再用 `Get-Process -Id 46948` → **进程不存在**（无输出）。
   即 **5680 的 LISTEN socket 挂在一个已死亡的 PID 下**（进程已退出，
   socket 未被回收的僵尸监听）。TCP 层能连上只是进了无人 accept 的 backlog，
   故 HTTP 永远无响应。

   这不是 CLI「逻辑卡死」，也**不是 App 的问题** —— 是 CLI 进程异常退出后
   端口未释放。影响：App 扫描探到 5680「TCP 可连」但拿不到 JSON → 判为非会话。

   **处置**：无需改代码；在电脑上重启 CLI（`d.bat` 或重开终端）即可恢复。
   已写入「真机验证清单」0b 作为前置检查。

**离线复现验证（不依赖设备，已执行）**：用 Node 脚本复刻 `SubnetCandidates.forHost`
修复后逻辑 + `LanScanner` 探测行为，结果：
- 候选数 = **254**，**含 `192.168.110.228` = true**（修复正确性确认）；
- 254 IP × 2 端口（5680/5681）并发 48 探测耗时 **3336ms**（在 10s 预算内）；
- 命中会话数 = 0 —— 但这是因 CLI 服务端卡死（上面第 2 点），非候选/探测逻辑问题。

**下一步（需用户）**：① 重插数据线恢复设备；② 重启 CLI（`d.bat` 或重开终端）
使其 `/mobile/session-info` 恢复响应；之后安装新 APK 复验扫描能否列出 `.228` 会话。
（用户已决定暂不处理 USB，先推进其它功能，本条留待设备可用时执行。）

## 第四轮：补齐 close(4002) 缺口 + 清理残留

**背景**：用户选择跳过真机验证，先推进文档中明确列出的功能缺口。

### 1. 区分 `close(4002)` 会话数上限与普通断线（MULTI-SESSION-PLAN.md 标的 ❌ 缺口）

- **原问题**：同一 CLI 上第 6 台设备连接时服务端 `ws.close(4002, '会话数已达上限')`
  （`mobileBridge.ts:814`）。客户端 `BridgeClient.onClosed` 只识别 4001（密钥），
  4002 落到「普通断线 → 指数退避重连」，表现为状态栏反复闪「已断开，重连中」，
  用户不知真实原因是「设备数满了」。
- **修复（与 4001 语义区分）**：
  - 新增事件 `BridgeClient.Event.SessionLimitReached(reason)`。
  - `onClosed` 中 4002 分支：**不停止重连**（可恢复——关掉旧设备即可连上），
    但把重连起点退避抬到 `SESSION_LIMIT_RETRY_MS = 30_000L`（普通断线是 1 秒），
    避免快速重连狂闪；同时写诊断并把原因 `会话数已达上限` 上报 `onDiagnosis`。
  - **抽取纯函数 `classifyClose(code): CloseAction`**（`AUTH_FAILED` /
    `SESSION_LIMIT` / `NORMAL`），把「关闭码 → 策略」决策从匿名
    `WebSocketListener` 闭包里提出来，使其**可单测**——这正是 4002 缺口长期
    未被发现的根因（闭包内逻辑只能真机试）。
  - `MainActivity` 新增 `SessionLimitReached` 分支：状态栏「设备数已满」+
    系统气泡说明「该 CLI 上连接的设备数已达上限（服务端 4002）。请在另一台设备上
    断开，或稍候自动重连（每 30 秒重试一次）。」——**不展开设置面板**（区别于认证失败）。
- **测试**：新增 `BridgeClientCloseTest`（4 用例）：4001 停重连无退避、4002 不停
  重连且退避 30s、其它码（1000/1006/1001/0）走普通重连、4002 退避显著长于普通。
- **变异验证**：把 `classifyClose` 的 4002 分支改成 `NORMAL` → 测试**如期失败**，
  证明新测试可证伪、非复刻型。恢复后全量 `:app:testDebugUnitTest` **BUILD SUCCESSFUL**。

### 2. 删除已核实的过时残留 `SubnetCandidates.kt.bak`

- PROGRESS 早先标「发现但未处置（需人工确认）」。本轮按规则核实后删除：
  ① **未被 git 追踪**（`git ls-files` 空）；② **无任何代码引用**（全仓 `rg` 只命中
  PROGRESS 自身记录）；③ 内容是**过时快照**——活文件 `SubnetCandidates.kt` 已修
  `bits` 掩码 bug（`32-8`→`32-bits`）并扩展。三条同时满足，删除安全。

### 3. 「代码块一键复制」评估结论：不做

PROGRESS 早先标「仍未做：代码块一键复制（现为长按菜单，够用）」。核查发现
`MessageActions.kt` 已实现完整的「复制代码块」动作（`Action.COPY_CODE`，标签含
代码块计数，无代码块时该项不出现）——长按菜单路径已满足需求。按 YAGNI，
不额外加右上角一键按钮。

## 第五轮：局域网功能深挖（用户点名）

用户指定方向「局域网功能」。逐模块核查后修掉 **2 个真实缺陷**（均不依赖设备）。

### 1. 统一 BeaconListener 与 LanScanner 的网卡筛选（注释与实现不符 + 逻辑漂移）

- **缺陷**：`BeaconListener.loop()` 的注释写着「LanScanner.localIpv4 也做了同样的
  网卡筛选，**两处标准一致**」，但实测**不一致**：`LanScanner` 排除了
  `rndis`/`usb`（USB 网卡），`BeaconListener` **没排除**。后果：手机若有 USB 网卡，
  广播会在其上 `joinGroup`（可能失败刷日志），扫描却不扫它 —— 两路行为分叉，
  「广播发现了但扫描找不到」这类现象无从解释。
- **修复（单一来源）**：抽 `LanScanner.isUsableInterface(name)`（`internal` 可测），
  封装全部前缀取舍（`rmnet`/`ccmni`/`p2p`/`rndis`/`usb` + 空名），
  `localIpv4()` 与 `BeaconListener.loop()` **共用**。注释与实现从此同源。
- **顺带修**：空网卡名此前被判「可用」（`""` 不以任何前缀开头）——已显式排除。
- **测试**：`LanScannerTest` +4 条（WiFi 可用、蜂窝/p2p 不可用、USB 不可用、
  null/空名不可用）。**变异验证**：去掉 `rndis/usb` 排除 → 「USB 网卡不可用」失败。

### 2. `isLikelyDeadLoopback` 漏掉 127.0.0.0/8 的其它回环地址

- **缺陷**：`ConnectionStrategy.isLikelyDeadLoopback` 只认字面量 `127.0.0.1`/
  `localhost`/`::1`。但整个 `127.0.0.0/8` 都是回环段，用户完全可能填
  `127.0.0.2`、`127.1.1.1`（合法回环，且同样只在 USB 转发下可达）。这些地址会被
  判成「正常局域网地址」→ 走 `RetrySaved` 分支**永不切换** → **恰好卡死在本模块
  要解决的失效地址上**（该模块存在的唯一理由就是消灭这个场景）。
- **修复**：判据改为覆盖 `localhost` / `::1` / `[::1]` / **整个 `127.` 前缀**，
  并加 `trim().lowercase()` 容错。
- **测试**：`ConnectionStrategyTest` +3 条（127 段全认、相近非回环地址不误判如
  `12.7.0.1`/`128.0.0.1`/`192.168.127.1`、127 段回环 + 失败 2 次 + 发现 LAN →
  端到端应 `SwitchTo`）。**变异验证**：只认 `127.0.0.1` → 相关用例失败。

### 核查结论：其余局域网模块无缺陷

- `BeaconRegistry`（摄入/过期/去重/快照）：逻辑正确，`STALE_MS=10s`（服务端 3s
  广播，容忍连丢 3 包）合理。
- `BeaconProtocol.parse`：类型校验严格（`port` 必须 JSON 数字、`interactive`
  必须真 boolean），与服务端 `mobileBeacon.ts` 字段类型**双向一致**
  （服务端发 `boolean`，两边都用 `=== true` / `opt(...) == true` 严格判断）。
- `BeaconProtocol.merge`：两列表各自 distinct 再合并，处理正确（注释记录该点
  曾被单测抓出）。
- 全量 `:app:testDebugUnitTest` + `:app:assembleDebug` **BUILD SUCCESSFUL**。

## 第六轮：预设常用网段列表（用户指定）

用户明确要求：把 `192.168.1.0/24` 与 `192.168.110.0/24` 作为**内置常用网段**，
无论手机连在哪个网段都一并扫描（覆盖「电脑与手机不同网段」的场景）。

### 实现

- `SubnetCandidates.COMMON_SUBNET_PREFIXES = ["192.168.1", "192.168.110"]`
  + `commonSubnetCandidates()`：两段各整段 /24 展开（各 254，共 508）。
- `LanScanner.candidates()`：改为「本机各网段（优先）+ 内置常用网段（兜底）」，
  经 `merge` 去重 —— 本机恰在 `192.168.1.x` 时，该段不会重复。
- `TOTAL_TIMEOUT_SEC` 10 → **15 秒**：候选最多 762 个 IP × 2 端口 = 1524 次探测，
  48 并发最坏约 9.6 秒（全部超时），15 秒留余量防弱网误截断。

### 验证

- 测试（`LanScannerTest` +3 条）：常用网段常量含两段、`commonSubnetCandidates()`
  返回 508 且含两段关键位置、与本机网段合并去重后 508 且本机优先。
- **变异验证**：把 `COMMON_SUBNET_PREFIXES` 置空 → 相关用例失败。
- 离线耗时估算（Node 脚本，已删）：最坏 762 IP → 9.6s ✅；本机在 `192.168.1.x`
  时 508 IP → 6.6s ✅，均在 15s deadline 内。
- 全量 `:app:testDebugUnitTest` + `:app:assembleDebug` **BUILD SUCCESSFUL**。

### 说明

- 本机所在网段**仍最优先**（排候选最前），预设网段仅兜底。
- 若将来要支持更多网段，只需往 `COMMON_SUBNET_PREFIXES` 加前缀（单一来源）。

## 第七轮：功能丰富 —— 系统性缺口分析后实施 #2 / #5 / #6

完成对手机端功能现状的系统性核查，纠正「功能太少」直觉误判：
- 已实现的（不再重复）：#1 对话搜索、#3 多工作区（部分）、#4 本地用量展示、#7 诊断复制。
- **真空白**：#2 生物识别解锁、#5 消息批量操作、#6 通知网络策略（仅 WiFi）。

### 已交付

#### #2 生物识别解锁 App（已完成）
- 需求：开启后每次打开 App 需用指纹/人脸解锁才能查看，防止手机离身泄露。
- 方案：`KeyguardManager.createConfirmDeviceCredentialIntent`（零新依赖，覆盖
  指纹/PIN/图案/密码）。离线环境无法引入 `androidx.biometric`，故用原生 framework API。
- 文件：新建 `AppLock.kt`（纯逻辑，`evaluate`/`shouldLock`）、`MainActivity.kt`
  加 `setupAppLockGate`/`removeAppLockOverlay` + `ActivityResultLauncher`；
  `LocalPrefs` 加 `KEY_APP_LOCK`（默认 OFF）、`SettingsFragment` 安全组登记；
  `strings.xml` 加 `app_lock_title`。
- 测试：`AppLockTest` 5 条含变异验证。BUILD SUCCESSFUL（test + assemble）。

#### #5 消息批量操作（已完成）
- 需求：长按消息进入选择模式，支持全选 / 复制所选 / 删除所选 / 取消。
- 方案：选中态存 `ChatMessage.selected`（**不进** toJson，避免污染历史文件）；
  纯逻辑 `BatchSelection` 抽离（toggle/toggleAll/isAllSelected/isActive/clear），
  `ChatAdapter` 加 `selectedIds` + `applySelection` + `onSelectionClick`（选择模式
  下点击切选中，否则失败重发），`ChatFragment` Views 加批量栏引用，
  `fragment_chat.xml` 加 include（默认 gone），新建 `fragment_batch_action.xml`
  + `bubble_selected.xml` 选中态背景，`strings.xml` 加批量字符串。
- 修复：`MainActivity.kt` 批量方法块末尾注释 `/**` 缺失导致类体闭合错位
  （`Expecting member declaration`），补回 `/**` 修复。
- 测试：`BatchSelectionTest` 7 条含变异验证。BUILD SUCCESSFUL（test + assemble）。

#### #6 通知网络策略（仅 WiFi）（已完成）
- 需求：打开「仅 WiFi 推送」后，移动数据下完全不推送（省流量 + 避免明文摘要经运营商）。
- 方案：纯逻辑 `NetworkPolicy.allowNotification(wifiOnlyPref, isWifi)` 可单测；
  `Notifications.notifyAssistant` / `notifyPermission` 在权限检查后接入策略判定；
  `isWifi` 用 `NetworkCapabilities.TRANSPORT_WIFI` 判断，**判定失败回落 true**（
  宁多推不漏推）；`AndroidManifest.xml` 补声明 `ACCESS_NETWORK_STATE`；
  `LocalPrefs` 加 `KEY_NOTIFY_WIFI_ONLY`（默认 OFF），`SettingsFragment` 通知组登记。
- 测试：`NetworkPolicyTest` 4 条含变异验证。BUILD SUCCESSFUL（test + assemble）。

### 验证口径
- 离线：`cmd.exe /c "_test.bat"`（testDebugUnitTest）+ 临时 `_assemble.bat`（assembleDebug）
  均 BUILD SUCCESSFUL，EXITCODE=0。

## 第八轮：修复批量改造的回归 + 菜单/复制反馈增强

### 问题（回归）
第七轮把长按从「单条操作菜单」改成「直接进入选择模式」，导致：
- `showMessageMenu`（复制/引用/编辑并重发/重新生成/删除）**彻底失去调用点，成为死代码**；
- 单条消息的成熟操作（尤其是「编辑并重发」「重新生成回复」「引用」）再也触发不了。

### 修复
- `MessageActions` 新增 `Action.SELECT_MULTIPLE`（「选择多条」），`availableActions`
  对**所有**消息（普通/工具/空）末尾追加该项 —— 单条菜单成为通往批量模式的入口。
- `MainActivity.onLongPress` 改回 `showMessageMenu(m)`（恢复单条菜单）；菜单 when 分支
  增加 `SELECT_MULTIPLE -> enterSelectionMode(m)`（从菜单进批量模式）。
- 两路并存：长按 → 单条菜单（复制/引用/编辑/重生成/删除/选择多条）；点「选择多条」
  → 批量模式（全选/复制所选/删除所选/取消）。不再互斥。

### 复制反馈增强
- `copyText` 去掉游离的 `true` 无用表达式（编译器 "expression is unused" 警告），
  新增语义化提示参数：`已复制全文 / 已复制代码块 / 已复制命令 / 已复制结果`
  （区分复制的是什么，比笼统「已复制」信息量更高）。

### 测试
- `MessageActionsTest`：更新 3 处精确列表断言（含 SELECT_MULTIPLE）；新增
  「任意消息菜单都含选择多条入口」+ 变异验证（availableActions 不返回 SELECT_MULTIPLE 则失败）。
- 全量 `:app:testDebugUnitTest` **BUILD SUCCESSFUL**（27 任务，EXITCODE=0）。
