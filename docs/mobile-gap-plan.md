# 手机端功能缺口分析与实施计划

> 生成：2026-10-10。前置文档：`mobile-feature-roadmap.md`（v2，已完成）、
> `mobile-adaptation-review.md`、`DUAL-MODE-PLAN.md`。
>
> 本文是**规划**，不是实施记录。每批完成后回填「实施对照表」。

---

## 〇、方法：先盘点，再规划

上一轮路线图（v2）的 5 个批次已全部完成（见其对照表）。本轮不重复造轮子，
而是**先做缺口盘点**，把「真缺口」与「已完成 / 不该做」分开。

盘点方式：逐文件读 8 个核心模块 + 交叉验证调用点，而不是按 TODO 注释找 ——
本仓库无 TODO 标记（已 grep 确认 0 命中），说明既有工程刻意不留 TODO。

---

## 一、盘点结论

### 1.1 已完成且质量达标（不重做）

| 模块 | 状态 | 判据 |
|---|---|---|
| 三层扫描（端口→IP→网段） | ✅ | 2026-10-10 完成，26 条测试 + 4 处变异验证 |
| 本地模式取模型 / 测会话 | ✅ | 同上，12 条测试 + 变异验证 |
| 设置体系（21 项 / 6 组） | ✅ | `LocalPrefs.ALL` 已登记 21 项，v2 规划已回填 |
| 会话分组排序 + 详情页 | ✅ | `SessionOrganizer` + `SessionDetailFragment` |
| 对话搜索 / 长按菜单 / 快捷指令 | ✅ | `ChatSearch` / `MessageActions` / `SlashCommands` |
| 历史管理 / 诊断历史 / 配置来源 | ✅ | `HistoryStore`(8 守卫测试) / `DiagnosisLog` / `ConfigSourceLabels` |
| 双模式后端抽象 | ✅ | `AgentBackend` 接口 + 两个实现，UI 不区分模式 |
| 前台服务保活 | ✅ | `ServicePolicy` 判据基于回合状态 |

### 1.2 真缺口（本计划要做的）

按「用户可感知 × 实现风险」排序。每条都给出**根因**，不接受「加上就行」。

#### G1 — 本地模式的会话是「一次性」的（🔴 最高优先）

**根因**（已核实代码路径）：

- `MessageStore.keyFor(host, port)` 的前缀是 **`host_port`**，与模式无关。
  `MainActivity:1351` 只在 `connectTo()`（远端路径）里调 `useSession`。
- 本地模式**从不调用 `useSession`** → `MessageStore` 一直用构造默认值
  `sessionKey = "default"` → 落到 `history-default.json`。
- 后果三重：
  1. **本地与远端历史串味**：若用户曾在 `default` 名下存过远端历史，
     切到本地模式会看到它，且新消息追加进去。
  2. **切换工作区不换历史**：本地模式下换工作区（设置里选目录）后，
     仍是同一份 `history-default.json` —— 两个不同项目的对话混在一条时间线。
  3. **`AgentLoop.history` 每次新建**：`LocalAgentBackend.runTurn` 里
     `history` 是**实例字段**（存活于进程），进程被杀后本地模式历史
     完全丢失 —— 而 `MessageStore` 里那份 JSON 从未被本地模式读过。

**判定**：这是双模式架构里唯一**结构性**的缺口（其余都是打磨）。
用户视角表现为「切了模式/换了项目，历史不对」。

#### G2 — 本地模式无法访问工作区之外的文件

**根因**：`LocalTools` 的 `safeFile()` 一律经 `WorkspacePath.resolve()`，
只允许工作区内相对路径。`WorkspacePath` 是全库唯一路径边界，改动它影响面大。

**判定**：这是**刻意的安全设计**（见 `LocalTools` 类注释）。不做「放开任意路径」。
若要做，正确做法是「用户显式授权第二个目录」，属独立课题，本轮**不纳入**。
→ 记入「明确不做」清单，避免将来反复被提起。

#### G3 — 本地模式没有「斜杠命令」这一层

**根因**：`SlashCommands.ALL` 是**服务端 `BRIDGE_SAFE_COMMANDS` 的镜像**，
5 条命令全部依赖服务端能力（`/compact` 压上下文、`/cost` 查成本、
`/summary` 总结、`/files` 追踪改动、`/clear` 清空）。

本地模式下这些**全部不可用**（`AgentLoop` 不实现它们），但快捷指令面板
仍会显示 —— 用户点了只会把字面文本 `/compact` 当消息发给模型，
模型收到一串无意义字符。

**判定**：真缺口，且**静默**（不报错，只是行为不对）。

#### G4 — 本地模式无「停止」之外的收敛手段

**根因**：`AgentLoop.DEFAULT_MAX_STEPS = 25` 是硬编码常量，
不可配置。用户无法为「简单问答」调低（省费用）、也无法为「长任务」调高。
`maxSteps` 字段已存在且注释写明「构造后可改，便于测试用极小值」——
即**接口已就绪，只缺 UI 与持久化**。

**判定**：低成本、低风险、可立即做。符合 YAGNI 阶梯第 2 条（已有能力，只缺接线）。

#### G5 — 历史导出格式单一

**根因**：`ChatExporter` 只有一种输出格式。v2 路线图 C1 提到
「导出格式可选（MD/纯文本/JSON）」但实施记录里只做了历史**管理**，未做格式选择。

**判定**：小缺口。优先级低于 G1-G4。

#### G6 — 无「项目/工作区」概念，只有「单个目录」

**根因**：`LocalPrefsStore` 只存**一个**工作区路径。
用户若在两个项目间切换，必须每次进设置重选目录 —— 且（叠加 G1）
历史还会串味。

**判定**：与 G1 同源，应在同一批处理（历史 key 一旦按工作区隔离，
多工作区才有意义）。**先做 G1，再评估 G6**。

---

## 二、功能模块划分

按**变更的层次**划分，而不是按页面 —— 这样每批的边界与回滚范围一致。

```
┌─────────────────────────────────────────────────────┐
│ 表现层 (Fragment / Adapter / Panel)                 │
│   ChatFragment · SessionFragment · SettingsFragment │
│   LocalConfigPanel · HistoryFragment                │
├─────────────────────────────────────────────────────┤
│ 状态层 (Store / Prefs)                              │
│   MessageStore · LocalPrefs · LocalPrefsStore       │
│   AppModePrefs · ScanPortPrefs                      │
├─────────────────────────────────────────────────────┤
│ 领域层 (纯逻辑 object，零 Android 依赖)              │
│   AgentLoop · LocalTools · SlashCommands            │
│   SubnetCandidates · LanScanner · ConnectionStrategy│
│   MessageActions · ChatSearch · SessionOrganizer    │
├─────────────────────────────────────────────────────┤
│ 传输层 (IO)                                         │
│   ProviderClient · BridgeClient · SessionScanner    │
└─────────────────────────────────────────────────────┘
```

**关键约束**：领域层与状态层必须可单测（无 Android 依赖或可注入）。
表现层不可单测，故**业务判据一律下沉**到领域层 —— 这是既有代码
（`SessionOrganizer` / `ConnectionStrategy` / `AutoConnect`）已经遵循的模式。

---

## 三、批次划分与实施顺序

不做并行。每批独立可交付、可回滚、可验证。

### 批次 M1 — 本地模式会话隔离（对应 G1）

**目标**：本地模式的历史按「工作区」隔离，且能被 `MessageStore` 持久化。

**设计**：

1. **会话 key 的语义扩展**。当前 `MessageStore.keyFor(host, port)` 只服务远端。
   新增 `MessageStore.keyForLocal(workspacePath)`：
   - 取工作区目录名的**稳定哈希**（不是完整路径 —— 完整路径含 `/` 等
     非法文件名字符，且会随存储位置变化）。
   - 格式：`local-<目录名>-<sha1前8位>`。可读（用户能从文件名认出是哪个项目）
     且稳定（同一目录多次进入得到同一 key）。
   - **必须**与远端 key 不可能碰撞：远端 key 含 `host_port`，前缀 `local-` 保证不撞。

2. **`LocalAgentBackend` 承担历史持久化**。当前它自己维护
   `private val history = mutableListOf<ChatMsg>()`，进程结束即丢。
   改为注入 `MessageStore`：
   - 启动时 `load()` 恢复历史 → 转成 `List<ChatMsg>`
   - 每轮 `Finished` 后 `saveAsync()` 落盘
   - `editMessage` 回退历史后同样落盘

3. **模式切换时切换历史文件**。`MainActivity` 的 `applyModeToUi()`
   里补：切到 LOCAL 时 `store.useSession(MessageStore.keyForLocal(workspace))`。

4. **`ChatMsg` ↔ `ChatMessage` 的转换**。两个类型不同：
   - `ChatMsg`（`ProviderClient.kt`）：OpenAI 格式，含 `toolCalls`/`toolCallId`
   - `ChatMessage`（UI 层）：含渲染字段（折叠态、图片、时间）
   - 转换必须**保留 tool_calls**，否则恢复的历史里工具调用链断裂，
     模型下一轮会困惑「我说过要调工具，结果呢？」
   - 抽出 `LocalHistoryCodec`（纯函数 object）以便单测往返转换。

**为什么这是最高优先**：它是双模式架构里唯一的结构性缺陷，
且用户已经能感知（切模式/换工作区历史不对）。

**验证**：
- `MessageStoreKeyTest` 扩充：`keyForLocal` 的稳定性、前缀隔离、
  特殊字符目录名（中文/空格/emoji）不产生非法文件名
- `LocalHistoryCodecTest`（新）：`ChatMsg → ChatMessage → ChatMsg`
  往返等价，含 tool_calls 链
- 端到端：本地模式发一条 → 杀进程 → 重开 → 历史还在

---

### 批次 M2 — 本地模式斜杠命令（对应 G3）

**目标**：本地模式下不显示服务端专属斜杠命令，改为显示本地可用的。

**设计**：

1. **`SlashCommands` 增加适用模式标注**。每条 `Entry` 加字段
   `scope: Scope`（`REMOTE` / `LOCAL` / `BOTH`）：
   - `/compact` `/cost` `/summary` `/files` → `REMOTE`（服务端能力）
   - `/clear` → `BOTH`（清空是客户端行为，两种模式都能做）

2. **新增本地专属命令**：
   - `/workspace` — 显示当前工作区绝对路径（本地模式下最常确认的信息）
   - `/model` — 显示当前模型名（不必进设置页）
   - `/tools` — 列出本地可用的 4 个工具（`read_file` 等），
     让用户知道模型能做什么、不能做什么（不能执行命令）

3. **`matching(input)` 与 `isKnown()` 增加 `mode` 参数**。
   调用点（`MainActivity` 的输入联想）传当前模式。

4. **本地模式下，服务端命令的提示文案**改为
   「`/compact` 需要连接电脑端，本地模式不可用（可改用「清空记录」）」。

**为什么不直接隐藏**：隐藏会让用户以为「本地模式功能少」；
显示但说明原因，用户才知道边界在哪 —— 与本地模式工具集的
「如实不提供执行命令」是同一原则。

**验证**：`SlashCommandsTest`（新）覆盖按模式过滤、未知命令识别、
本地命令的 `sendImmediately` 语义。

---

### 批次 M3 — 本地模式可配置项（对应 G4）

**目标**：`maxSteps` 可配、温度可配。

**设计**：

1. `LocalPrefs` 新增两项：
   - `KEY_LOCAL_MAX_STEPS` — 选项 `10 / 25 / 50`，默认 25（= 当前行为）
   - `KEY_LOCAL_TEMPERATURE` — 选项 `精准(0) / 平衡(0.7) / 发散(1.2)`，
     默认「平衡」但 **`ProviderConfig.temperature` 默认是 null**（不发送该参数）。
     此处若默认非 null 会改变现有请求体 —— **默认必须是「不发送」**，
     即选项里加一项「服务端默认」作默认值。

2. `LocalAgentBackend` 构造时读偏好注入 `maxSteps`；
   `configProvider` 已能读最新配置，温度走 `ProviderConfig.temperature`。

3. **配置项改动即时生效**：`LocalAgentBackend.runTurn` 每次新建 `AgentLoop`，
   故每次运行前读偏好即可，无需重启。

**为什么默认值必须是当前行为**：规划约束 2（见 v2 文档）。
`maxSteps=25` 与「temperature 不发送」就是当前行为，必须保持一致。

**验证**：`LocalPrefsDefinitionTest` 扩充（新增项必须有默认值且在 options 内）；
`AgentLoopTest` 已有 maxSteps 注入测试可复用。

---

### 批次 M4 — 多工作区（对应 G6，**需先评估**）

**目标**：本地模式可保存多个工作区并快速切换。

**前置条件**：M1 必须先完成（历史按工作区隔离后，多工作区才有意义）。

**设计（草案，实施前需评估）**：

- `LocalPrefsStore` 从「单路径」改为「路径列表 + 当前项」
- 迁移：现有 `workspace_path` 读作列表首项，不破坏老数据
- UI：`LocalConfigPanel` 的「选择目录」改为可管理列表

**为什么标「需先评估」**：这会让设置页变复杂，而收益取决于
用户是否真的在手机上切换多个项目。若 M1 完成后用户反馈「切项目很麻烦」
再做；否则属过度设计（YAGNI 阶梯第 1 条）。

**评估方法**：M1 上线后收集「是否有人重复切换工作区」，
无数据则**不做**。

---

### 批次 M5 — 导出格式（对应 G5）

**目标**：历史导出可选 Markdown / 纯文本 / JSON。

**设计**：
- `ChatExporter` 拆出 `format` 参数（纯函数，可单测）
- 设置页导出时弹三选一

**优先级最低**：用户当前可用系统分享导出，格式单一只是不便，不是错误。

---

## 四、明确不做（记录理由，避免反复被提起）

| 项 | 不做理由 |
|---|---|
| 本地模式执行 shell 命令 | Android 沙箱无 shell（`Runtime.exec` 拿不到 `sh`/`grep`/`git`）。内嵌解释器几十 MB 且行为不全；依赖 Termux 就不是本地模式。已在 `SystemPrompt` 明确告知模型 |
| 本地模式访问工作区外文件 | `WorkspacePath` 是唯一路径边界，放开等于取消沙箱。若要做需「用户显式授权第二目录」的完整设计，远超本轮 |
| 多会话同屏监控 | 需服务端多路推送 + 客户端多连接并存，架构级改动 |
| 消息编辑重发（远端） | 需服务端「撤回并重发」语义，当前协议无此概念 |
| 手机端触发 `--resume` | 跨「远程控制」边界，需手机启动电脑进程 |
| 新建更多页面 | 页面数已够（3 主 + 4 二级），再加会稀释导航效率（v2 约束 3 仍适用） |

---

## 五、约束（沿用 v2，并补充本轮教训）

1. **每批完成后真机验证**。编译 + 单测 + lint 全过而装上即崩，本仓库发生过。
2. **本地偏好默认值 = 当前行为**。升级后界面不能突变。
3. **优先扩展现有页面，不新建页面**。
4. **新增设置项必须有说明文字**（`LocalPrefs.Definition.desc` 是必填字段）。
5. **业务判据下沉到领域层**，表现层只做「取值 → 渲染」。
6. **【本轮新增】跨层数据传递必须穷举字段**。
   教训：payload 只声明「自己认为需要的」字段，类型检查与单测都过，
   但渲染层读不到 → 功能静默降级。抽取类型转换时用
   `rg -o "obj\??\.[a-zA-Z_]+"` 穷举读取点。
7. **【本轮新增】测试必须用变异验证**。
   复刻型测试（在测试里重实现一遍逻辑）在生产代码改动时不会失败，
   只提供虚假安全感。新测试一律注入缺陷确认会失败。

---

## 六、实施对照表

| 批次 | 内容 | 状态 | 验证 |
|---|---|---|---|
| M1 | 本地模式会话隔离（按工作区） | ✅ 完成 | 28 条新测试；4 处变异全部捕获；880/880 通过；APK 构建成功 |
| M2 | 本地模式斜杠命令（按模式过滤） | ✅ 完成 | 19 条新测试；2 处变异全部捕获；901/901 通过；APK 构建成功 |
| M3 | 本地模式可配置项（maxSteps / 温度） | ✅ 完成 | 4 条新测试；2 处变异全部捕获；905/905 通过；APK 构建成功 |
| M4 | 多工作区 | ✅ 完成 | 15 条新测试；2 处变异全部捕获；920/920 通过；APK 构建成功 |
| M5 | 导出格式可选 | ✅ 完成 | 11 条新测试；2 处变异全部捕获；931/931 通过；APK 构建成功 |

### M4 实施记录（2026-10-10）

原计划「等 M1 上线后的反馈再决定」—— 用户明确要求做完，据此实施。

**改动**
- 新增 `WorkspaceList`（纯函数 object）：parse/serialize/add/switchTo/remove。
  与 `HostHistory` 同模式 —— 列表操作错了全是静默的（切换不生效/工作区消失），
  必须可单测（`LocalPrefsStore` 依赖 Context，测不了）。
- `LocalPrefsStore`：存储从单键 `workspace_path` 改为 `workspace_list`
  （换行分隔，首项 = 当前）。**读时迁移**：读到旧键而新键为空时，把旧值
  作为列表首项写入并清掉旧键 —— 老用户原来选的目录原样出现在列表里。
- API：`workspaceList()` / `addWorkspace`（置顶而非重复）/ `switchWorkspace`
  （只允许切到已验证目录）/ `removeWorkspace`（移除列表项不动磁盘）。
  `workspacePath()` 与 `setWorkspace()` 保留兼容语义。
- `LocalConfigPanel.pickWorkspace` 改为分段对话框：「已保存（点选切换）」
  + 「添加新目录」+ 中性键「移除…」。
- 接线：`onWorkspaceSwitched` → `applyModeToUi()` → `refreshSessionScope()`
  （M1 铺好的路：换工作区自动换历史文件 + 重建本地后端）。

**不变量**
- 列表首项 = 当前工作区 = `MessageStore.keyForLocal()` 的输入（M1 联动，
  有专门测试钉死）
- `add` 超上限（8）丢最旧
- `switchTo` 不接受列表外的路径

**测试**：`WorkspaceListTest`（15 条）
**变异验证**：add 改尾部追加 → 3 条失败；switchTo 不置顶 → 2 条失败
（含 M1 联动契约）

### M5 实施记录（2026-10-10）

**改动**
- `ChatExporter.Format` 枚举：MARKDOWN / PLAIN / JSON（各带 label 与 desc，
  供选择弹窗展示）
- `ChatExporter.export(messages, label, format)` 分发；**默认 MARKDOWN**
  = 改造前行为（不传格式的调用路径不变）
- `toPlainText`：只有「角色: 内容」，刻意零符号（选纯文本就是为了粘贴干净）
- `toJsonText`：首条 meta（导出时间/条数/会话名），其后逐条 `ChatMessage.toJson()`
  —— **与 MessageStore 落盘同源**，用户写脚本不用学两套 schema
- `SettingsActions.exportHistory`：先弹三选一（带一行说明），再走原分享

**测试**：`ChatExporterTest` 扩充 11 条
- 纯文本不含 `#`/`>`/`---`；顺序保持；空历史空串；会话名在首行
- JSON 可解析；空历史空串；**字段集合与落盘一致**（双向契约）
- `export` 默认 = Markdown（回归保护）；按格式分发；label/desc 非空

**变异验证**：PLAIN 分发错走 Markdown → 1 条失败；纯文本混入 `##` 符号 → 1 条失败

### M3 实施记录（2026-10-10）

**改动**
- `LocalPrefs` 新增 `KEY_LOCAL_MAX_STEPS`（默认 25 = `AgentLoop.DEFAULT_MAX_STEPS`）、
  `KEY_LOCAL_TEMPERATURE`（默认 `default` = 不发送该参数，**不污染**现有请求体）。
- `LocalAgentBackend.LocalPrefsReader` 接口：仅暴露 `maxSteps()` 与
  `temperature()`，避免接口膨胀。`DEFAULT` 兜底 = 当前行为。
- `LocalAgentBackend.modelCallOverride` 用可空参数 + `?:` 解析，**避免**
  init 块覆盖调用方注入（首版踩坑：注入的假实现被 init 静默覆盖，
  测试超时 + 405）。
- `LocalAgentBackend.runTurn`：每次读最新偏好 → 合成 `effectiveCfg` 覆盖温度
  → 注入 `loop.maxSteps`。**未**持久化到 `LocalPrefsStore.providerConfig()`
  （那个字段跟偏好语义不同，不能用偏好污染它）。

**测试**：`LocalBackendPreferencesTest`（4 条）
- `maxSteps=1` 截断
- 不传 prefs = DEFAULT 行为（不升级回归）
- `temperature=null` 时 `cfg.temperature` 仍为 null（**关键不变量**）
- `temperature=0.0` 真的覆盖 `cfg.temperature=0.7`

**变异验证（2/2 捕获）**
| 注入缺陷 | 失败用例 |
|---|---|
| 去掉 `loop.maxSteps = runMaxSteps` | `maxSteps=1` 截断失败 |
| `effectiveCfg = cfg`（不覆盖温度） | 温度覆盖失败 |

**踩坑（值得记录）**
- **Kotlin 字段默认 lambda 引用其他实例字段会编译失败** —— 因为初始化按
  声明顺序进行。把「调用方未传则赋默认」的实现用「可空参数 + `?:` 兜底」
  替代 init 块赋值，从结构上杜绝 init 块覆盖调用方注入的常见陷阱。
- **测试断言要小心 `addAll`**：`captured.addAll(msgs)` 加的是「消息列表里的所有消息」
  而非「一次调用」。要么用计数器，要么理解清楚自己加的是什么。
- **`send=true, called=0, errs=[]`** 是个经典征兆：worker 跑了，**没调 modelCall**，
  也没发 Error——几乎肯定是 init 块把注入的 lambda 覆盖回真发 HTTP，
  而真发 HTTP 抛了 ProviderException，但 ProviderException 经 catch 时
  Error 事件被发到 onEvent，但**测试的 onEvent 设晚了一步**（覆盖了默认 noop）。
  两个独立 bug 叠加表现成「什么都没发生」。

### M2 实施记录（2026-10-10）

**改动**
- `SlashCommands.Entry.Scope`：`REMOTE` / `LOCAL` / `BOTH`。
  - REMOTE：依赖 CLI 服务端能力（`/compact` `/cost` `/summary` `/files`）
  - LOCAL：本机可直接给答案的（`/workspace` `/model` `/tools`）
  - BOTH：行为两用（`/clear`）
- `matching(input, scope?)`：scope 过滤命令池
- `isKnown(command, scope?)`：scope 过滤认可集合
- `Entry.matches(scope)` 扩展：BOTH 永远通过
- `MainActivity.currentCommandScope()`：返回 `LOCAL` / `REMOTE`
- `MainActivity.handleLocalCommand(text)`：本地模式下直接给答案
  （显示工作区路径、模型+端点、可用工具清单），不发到模型
- `showQuickPrompts()` 改用按 scope 过滤后的命令列表
- 未知命令提示文案动态列出当前模式可用命令

**测试**：`SlashCommandsTest`（19 条）覆盖双向过滤、BOTH 互斥性、模式不互交、
  前缀参数、isKnown 模式感知、数据完整性（无重名、不与白名单冲突）

**变异验证**：
- 漏 BOTH 分支 → 4 条失败
- `isKnown` 不传 scope → 1 条失败

### M1 实施记录（2026-10-10）

**改动**
- `MessageStore.keyForLocal(workspacePath)`：`local-<目录名>-<sha1前8位>`。
  哈希用**已 trim** 的字符串（否则尾斜杠差异产生两份历史，测试已钉死）。
- `MessageStore.saveLocalHistory/loadLocalHistory`：走 `LocalHistoryCodec` 的
  JSON 格式（仅 user/assistant/system，跳过 tool），沿用「临时文件 + rename」。
- `LocalAgentBackend.HistoryStore` 接口（load/save 全量快照）+ `NO_OP` 默认值。
  注入函数而非直接持 `MessageStore` —— 后者依赖 `Context`，会让本类无法单测。
- `LocalAgentBackend.history` 改为 `by lazy { historyStore.load() }`，
  `runTurn` 末尾与 `editMessage` 落盘。
- `MainActivity.refreshSessionScope()`：按「模式 + 目标」算 key 并 `useSession`，
  本地模式下重建后端。**去重**（`activeScopeKey`）避免高频入口反复读盘。
- `reloadHistoryIntoAdapter()` 对视图未就绪做守卫（冷启动路径 `list` 未赋值）。

**测试**
- `LocalHistoryCodecTest`（12 条）：JSON 往返、tool_calls 链保留、坏 JSON 整体丢弃、
  单条脏数据逐条跳过、空 system/assistant 的取舍
- `MessageStoreKeyTest` 扩充（11 条）：前缀隔离、同名不同路径、尾斜杠规范化、
  中文/空格/emoji 目录名、路径穿越
- `LocalBackendHistoryTest`（5 条）：未配置不落盘、默认 NO_OP、恢复历史、
  editMessage 落盘、close 后不抛

**变异验证（4/4 捕获）**
| 注入缺陷 | 失败用例数 |
|---|---|
| 哈希改用目录名（同名目录撞） | 1 |
| 去掉 `local-` 前缀 | 4 |
| `toJson` 不跳过 tool | 1 |
| `editMessage` 不落盘 | 2 |

**踩坑（值得记录）**
- Kotlin 的 `continue` **不能**出现在 `when` 分支体内跳外层 `for` —— 它只作用于
  分支内层。首版三处这么写，导致 tool 消息与空消息全被写出。改用
  `if (...) continue` 放在循环体顶层。
- 测试期望曾写错（`带 tool_calls 的 assistant` 我期望它被跳过）—— 实现是对的，
  是期望错了。**实现与期望不一致时，先判断哪个是需求**：模型下一轮需要
  靠 tool_calls 理解自己的历史，故必须保留。

---

## 七、附录：G1 的代码证据

盘点 G1 时确认的三条路径，供实施时直接对照：

```
① MessageStore.kt:28
   private var file = File(context.filesDir, "history-$sessionKey.json")
   ← sessionKey 默认 "default"

② MainActivity.kt:1351（唯一调用 useSession 的地方，在远端 connectTo 内）
   store.useSession(MessageStore.keyFor(host, port))
   ← 本地路径完全不经过这里

③ LocalAgentBackend.kt:69
   private val history = mutableListOf<ChatMsg>()
   ← 实例字段，进程结束即丢；且从未与 MessageStore 交互
```

三条路径共同导致：本地模式历史落 `history-default.json`，
与远端 `default` 名下历史（若存在）合流，且换工作区不切换文件。
