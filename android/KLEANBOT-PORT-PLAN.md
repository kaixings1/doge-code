# KleanBot → doge-code Android 移植计划

> 目标：把 KleanBot（包名 `dev.pegasus.kleanbot`）中**能用的功能 / 界面元素 /
> 图标 / 资源**全部吸收进 `D:\doge-code\android`（包名 `com.dogecode.mobile`）。
>
> **源路径更正（2026-10-13 实测）**：真实源在 **`D:\.github\mobile\KleanBot\`**，
> 不是本文档早期写的 `gpt_mobile\viewchat` —— 后者是**另一个项目**
>（`dev.chungjungsoo.gptmobile`，与 KleanBot 无关）。按错误路径去找会一无所获。
>
> 状态：**阶段 1（呼吸光标）与阶段 2（图标 + 空态）已实施**（2026-10-13）；
> 阶段 3（逐字动画）未做。
> 编写日期：2026-10-12（2026-10-13 更正源路径）

---

## 0. 一句话结论

KleanBot 是一份**体量小（26 个 kt / 约 1800 行）、质量高、依赖少**的 AI 聊天实现，
其中**流式逐字渲染 + 呼吸光标 + markdown-lite 格式化**是 doge-code 目前**没有**的能力
（doge-code 的消息是静态渲染）。移植价值集中在 **UI 呈现层**。

**最大障碍**：KleanBot 用 **Material3 主题属性**（`?attr/colorSurfaceContainerLow`、
`?attr/colorPrimary`、`?attr/colorTextBody`…），而 doge-code 用
**`Theme.AppCompat.NoActionBar` + 硬编码色值 + 零 drawable**。
→ 移植必须新增一层**主题属性映射**，否则所有气泡背景/图标会渲染异常。

---

## 1. 移植源清单（KleanBot / viewchat）

源根目录（**已更正**）：`D:\.github\mobile\KleanBot\app\src\main\`

### 1.1 Kotlin 源码（26 文件，约 1800 行）

| 分组 | 文件 | 行数 | 作用 | 移植价值 |
|---|---|---|---|---|
| **utilities** | `MarkdownLiteFormatter.kt` | 105 | markdown-lite 格式化（`**粗体**`/`` `代码` ``/围栏代码块/标题） | ★★★ **纯逻辑，零 Android 依赖冲突**（只用 android.text 的 Spannable） |
| **utilities** | `TypeWriter.kt` | 38 | TextView 逐字打字机动画 | ★★ 简单，已被 Adapter 的流式渲染取代，**可只作参考** |
| **utilities** | `SingleLiveEvent.kt` | 43 | 一次性事件 LiveData | ★ 已被 doge-code 的架构绕过，**低优先** |
| **utilities** | `InternetManager.kt` | 41 | 网络连通性检查 | ★★ 可复用 |
| **utilities** | `ConstantUtils.kt` | 15 | 常量 | ★ 看内容 |
| **utilities/extensions** | `NestedScrollViewExtensions.kt` | 18 | 滚动到底部扩展 | ★★ 小工具 |
| **presentation/widget** | `TypingCursorSpan.kt` | 68 | **呼吸圆点光标**（ReplacementSpan + ValueAnimator） | ★★★ **核心亮点**，doge-code 无此能力 |
| **presentation/adapter** | `AdapterOpenAI.kt` | 208 | **聊天适配器**：流式逐字 + 稳定前缀缓存 + 呼吸光标 + markdown | ★★★ **最高价值**，但依赖 Material/ViewBinding |
| **presentation/enums** | `OpenAIRole.kt` | 21 | 角色枚举（chatgpt/user/assistant/system） | ★★ doge-code 已有等价物，**做映射** |
| **presentation/uiStates** | `ApiResponse.kt` | 22 | 统一 UI 状态（Loading/Streaming/Success/Failure） | ★★ 参考其**流式状态建模** |
| **data/entities** | `Message.kt` | 8 | 消息模型（role/content/isStreaming） | ★★ **`isStreaming` 标记是流式渲染的关键**，doge-code 的 ChatMessage 需补此字段 |
| **data/settings** | `ChatHistoryCodec.kt` | 43 | 纯 JSON 编解码（无 Android 依赖） | ★★ 可单测；doge-code 已有 MessageStore |
| **data/settings** | `ChatHistoryStore.kt` | 92 | 会话历史持久化 | ★ 与 doge-code MessageStore **功能重叠**，择优 |
| **data/settings** | `SettingsStore.kt` | 52 | 设置持久化 | ★ 与 doge-code 偏好重叠 |
| **data/settings** | `Session.kt` | 13 | 会话数据模型 | ★ 参考 |
| **data/settings** | `AppSettings.kt` | 33 | 设置模型 | ★ 参考 |
| **data/dataSources** | `DataSourceRemoteOpenAI.kt` | 199 | **OpenAI SSE 流式请求** | ⚠️ **冲突**：doge-code 走自己的桥接协议，**不建议直接移植**，仅借鉴 SSE 解析 |
| **domain/useCases** | `UseCaseOpenAI.kt` | 240 | 业务用例（发消息/流式/错误分类） | ⚠️ 同上，参考其**错误分类**（ApiErrorKind） |
| **presentation/viewModel** | `ViewModelOpenAI.kt` | 106 | ViewModel | ⚠️ doge-code 无 ViewModel 体系，**低优先** |
| **presentation/viewModel** | `ViewModelProviderOpenAI.kt` | 23 | ViewModel 工厂 | ⚠️ 同上 |
| **presentation/ui** | `ActivityHome.kt` | 244 | 聊天主界面控制器 | ★★ 参考其**流式驱动逻辑** |
| **presentation/ui** | `SettingsActivity.kt` | 90 | 设置页 | ★ 与 doge-code SettingsFragment 重叠 |
| **presentation/ui** | `MainActivity.kt` | 39 | 入口 | ✗ 不需要 |
| **di** | `DIManual.kt` | 27 | 手工依赖注入 | ✗ 不需要 |
| — | `App.kt` | 27 | Application | ✗ 不需要 |

**分级结论**：
- **A 级（必移，纯逻辑/独立）**：`MarkdownLiteFormatter`、`TypingCursorSpan`、`NestedScrollViewExtensions`、`InternetManager`
- **B 级（重点借鉴 + 适配移植）**：`AdapterOpenAI`（流式/光标/前缀缓存三合一）、`Message.isStreaming`、`ApiResponse` 的流式状态
- **C 级（仅参考思路，不搬代码）**：`DataSourceRemoteOpenAI`、`UseCaseOpenAI`、`ViewModelOpenAI`、`ActivityHome`（doge-code 有自己的桥接协议与控制器，直接搬会两套并存）
- **D 级（不移植）**：`App`、`MainActivity`、`DIManual`、`SettingsActivity`、`SettingsStore`、`ChatHistoryStore`（与 doge-code 现有实现重叠）

### 1.2 布局 XML（8 文件）

| 文件 | 作用 | 移植方式 |
|---|---|---|
| `activity_home.xml` | 聊天主界面（Toolbar + NestedScrollView + RecyclerView + 输入栏 + send 按钮） | **参考布局结构**；组件需换成 doge-code 的手写风格 |
| `item_home_left.xml` | **助手气泡**（MaterialTextView + 圆角背景 `bg_shape_rounded_corner_filled`） | ★★★ 移植（换成普通 TextView + 自带 drawable） |
| `item_home_right.xml` | **用户气泡**（圆角背景 `..._filled_primary`） | ★★★ 移植 |
| `item_ai_chat_loading.xml` | 加载中占位（三点跳动） | ★★★ 移植 |
| `item_ai_chat_error.xml` | 错误提示气泡 | ★★★ 移植 |
| `item_ai_chat_placeholder.xml` | 空态（No Messages Yet!） | ★★ 移植 |
| `activity_settings.xml` | 设置页 | ✗ 与 doge-code SettingsFragment 重叠 |
| `activity_main.xml` | 入口 | ✗ 不需要 |

### 1.3 图标 / Drawable（7 文件）

| 文件 | 格式 | 内容 | 依赖 |
|---|---|---|---|
| `ic_send.xml` | vector | 纸飞机发送图标（24×24 viewport，800dp 声明） | 无（fillColor 硬编码 `#292D32`）|
| `ic_stop.xml` | vector | 方块停止图标 | 无（`#FF000000`）|
| `ic_robot.png` | png 48KB | 机器人头像 | 无 |
| `bg_shape_rounded_corner_filled.xml` | shape | 助手气泡背景（左下 4dp 圆角）| ⚠️ `?attr/colorSurfaceContainerLow` **M3 属性** |
| `bg_shape_rounded_corner_filled_primary.xml` | shape | 用户气泡背景（右下 4dp 圆角）| ⚠️ `?attr/colorPrimary` **M3 属性** |
| `ic_launcher_background.xml` | vector | 启动图标背景 | — |
| `ic_launcher_foreground.xml` | vector (v24) | 启动图标前景 | — |

**可直接拿（无依赖）**：`ic_send`、`ic_stop`、`ic_robot.png`。
**需替换色值**：两个 `bg_shape_*.xml`。

### 1.4 其他资源

- `values/strings.xml`、`values-night/`（深色）、`mipmap-*`（全套启动图标）、`xml/`

### 1.5 KleanBot 依赖（`viewchat/app/build.gradle.kts`，已确认）

```kotlin
compileSdk = 37 ; buildToolsVersion = "36.0.0" ; minSdk = 23 ; Java 11
buildFeatures { viewBinding = true }
dependencies:
  androidx.core.ktx / appcompat / activity / constraintlayout / recyclerview
  androidx.fragment.ktx
  androidx.lifecycle.viewmodel.ktx / livedata.ktx
  kotlinx.coroutines.android
  androidx.datastore
  com.google.android.material（material.viewchat）
  Retrofit / converter-gson / converter-scalars / logging-interceptor（SSE 走 OkHttp 直连）
```

**对 doge-code 的影响**（已核对其 `app/build.gradle.kts`）：

| 依赖 | doge-code | 结论 |
|---|---|---|
| `appcompat` / `activity-ktx` / `recyclerview` / `constraintlayout` | ✅ 已有 | 直接可用 |
| `okhttp3` 4.12.0 | ✅ 已有 | 网络能力具备（但**不搬**网络层）|
| `kotlinx-coroutines-android` 1.8.1 | ✅ 已有 | 可用（流式渲染仍建议 Handler，无需协程）|
| `lifecycle-runtime-ktx` | ✅ 已有 | 可用 |
| **Material（material.viewchat）** | ❌ 无 | **不加** → 气泡布局换原生 TextView |
| **ViewBinding** | ❌ 无 | **不开** → 适配器用 findViewById |
| **DataStore** | ❌ 无 | **不加** → 用现有 SharedPreferences/文件 |
| **Retrofit** | ❌ 无 | **不加** → 不搬网络层 |

- `MarkdownLiteFormatter` / `TypingCursorSpan`：**零依赖**（只用 android.text/graphics/animation）
- 气泡布局：Material 控件 → 原生 `TextView`（**不加 Material**）
- 流式渲染：`Handler` + `ValueAnimator`（**不需新增协程**）
- 网络：**不搬**（走 doge-code 桥接）

---

## 2. 移植目标现状（doge-code / android）

目标根目录：`D:\doge-code\android\app\src\main\`

| 维度 | 现状 |
|---|---|
| 包名 | `com.dogecode.mobile`（**86 个 .kt，约 1.1 万行**）|
| 主题 | `Theme.DogeMobile` parent=`Theme.AppCompat.NoActionBar`，**无 Material 依赖** |
| 颜色 | **硬编码**（`#1a1a1a`/`#8AB4F8`/`#DDDDDD`…），无 `colors.xml` |
| drawable | **13 个**（`bubble_user/assistant/system/tool/tool_error/group/selected.xml`、`chip_bg[_on].xml`、`dot_on/off.xml`、`input_bg.xml`、`ic_launcher_foreground.xml`）—— 全是手写 shape |
| 图标 | **仅 1 个 launcher 矢量图**；工具栏图标全用系统 `@android:drawable/*` |
| 布局风格 | 手写 LinearLayout/TextView，用 `?android:attr/selectableItemBackground` |
| 消息渲染 | `ChatAdapter.kt`（**4 种 ViewType**：MESSAGE/TOOL/GROUP/DIVIDER），`item_message.xml`（`bubble`+`image_row`+`meta`）、`item_tool.xml`、`item_turn_group.xml` |
| **流式能力** | ⚠️ **已有**：`ChatAdapter.streamingPreview` + `Row.Streaming` + `bindStreaming()`（显示「生成中…」）|
| **Markdown** | ⚠️ **已有**：`ChatAdapter.parseMarkdown()`/`renderMarkdown()`（`Piece(Seg.TEXT/BOLD/CODE_BLOCK/CODE_INLINE)`），**内联实现、无第三方库** |
| 聊天控制器 | `ChatFragment`（Views 类）+ `ChatAdapter` + `ChatMessage`（role + 工具字段 + 图片 + 回合分组）|
| 存储 | `MessageStore`（按 `history-<host>_<port>.json` 分会话，单线程串行写盘）|
| 测试 | **73 个测试文件**（约 385 用例），涵盖 `MarkdownParseTest`/`ToolVisualTest`/`TurnGroupingTest` 等 |
| 依赖 | appcompat / activity-ktx / recyclerview / constraintlayout / okhttp / coroutines / lifecycle-runtime-ktx；**无 Material、无 ViewBinding、无 DataStore、无 Retrofit** |
| 构建 | compileSdk=35 / minSdk=24 / targetSdk=35，AGP 8.7.3，Kotlin 1.9.24，Java 17 |
| 文档 | `PROGRESS.md`、`MULTI-SESSION-PLAN.md`、`BUILD.md` |

> **⚠️ 调研更正（重要）**：初稿曾误判 doge-code「drawable 为空」「无 markdown 实现」，
> 系查询命令有误。实测确认：**drawable 有 13 个**、**markdown 与流式预览均已实现**。
> 这**大幅缩小**了移植范围 —— 见 §2.1。

**已有的等价物**（移植时避免重复造）：
- 消息模型 → `ChatMessage`（已有，字段比 KleanBot 的 `Message` 丰富得多）
- 历史存储 → `MessageStore`（已有，比 `ChatHistoryStore` 更完整）
- 设置存储 → `MainActivity` 的 SharedPreferences（已有）
- 角色概念 → doge-code 用 `role: String`（`user`/`assistant`/`tool`/`system`/`error`）
- **Markdown 渲染 → `ChatAdapter.parseMarkdown`/`renderMarkdown`（已有！）**
- **流式预览 → `ChatAdapter.streamingPreview` + `bindStreaming`（已有！）**
- 气泡背景 → 8 个 `bubble_*.xml`（已有）

### 2.1 实测差异：**真正的缺口只有 3 处**

经逐文件对照（含编译级核对），KleanBot 相对 doge-code 的**真实增量**极小：

| KleanBot 资产 | doge-code 是否已有 | 结论 |
|---|---|---|
| **`TypingCursorSpan`（呼吸圆点光标）** | ❌ **无**（只有静态「生成中…」文字）| ★★★ **唯一明确必移项** |
| **`TypeWriter`（逐字打字机）** | ⚠️ 部分（有 streaming 但**无逐字动画**）| ★★ 可选：加逐字效果 |
| **`item_ai_chat_loading/error/placeholder.xml`** | ⚠️ 部分（有 `bubble_*`，但**无独立空态/错误态/三点加载布局**）| ★★ 可选：补空态/错误态 |
| `ic_send` / `ic_stop` / `ic_robot.png` | ❌ 无（工具栏用系统图标）| ★★ **可直接拿**（无依赖）|
| `MarkdownLiteFormatter` | ✅ **已有等价**（`ChatAdapter.parseMarkdown`，能力相当）| ✗ **不移**，最多借鉴其「稳定前缀缓存」思路 |
| `AdapterOpenAI` 流式逻辑 | ✅ **已有等价**（`bindStreaming`）| ✗ **不移**，仅借鉴「前缀缓存」防 O(n²) |
| `Message.isStreaming` | ⚠️ 用 `streamingPreview`（单条预览）替代 | ✗ 无需改模型 |
| `ApiResponse` / `OpenAIRole` / `ChatHistoryCodec` / `Session` | ✅ 已有对应物 | ✗ 不移 |
| `DataSourceRemoteOpenAI` / `UseCaseOpenAI` / `ViewModelOpenAI` | ✅ 走桥接 + `ProviderClient` | ✗ **不移** |
| `ActivityHome` / `SettingsActivity` / `App` / `DIManual` | ✅ 有 `ChatFragment` / `SettingsFragment` / `MainActivity` | ✗ 不移 |

**修正后的移植重点**：
1. **`TypingCursorSpan`** —— 给现有 `bindStreaming` 加呼吸光标（**唯一硬需求**）
2. **`ic_send` / `ic_stop` / `ic_robot.png`** —— 补图标（当前用系统图标，观感弱）
3. **空态/错误态/加载态布局** —— 可选补充
4. **`TypeWriter` 逐字动画** —— 可选增强

---

## 3. 冲突点与对策（**关键章节**）

> ⚠️ 经 §2.1 实测修正：由于**不需要**移植 KleanBot 的布局/背景 XML（doge-code 自有等价物），
> **冲突 1 与冲突 2 已基本消解**。现存的唯一冲突是「光标颜色/密度的取值口径」。

### 冲突 1（已消解）：Material3 主题属性

KleanBot 的背景/文字色引 `?attr/color*`（M3），doge-code 无这些属性。
**但实测后不需要搬 KleanBot 的 `bg_shape_*.xml`** —— doge-code 已有 8 个 `bubble_*.xml`。
→ **无需新增主题属性**。若将来确实要搬某个引 `?attr/` 的 XML，再用下述方案：

<details><summary>备用方案（自定义同名 attr）</summary>

```xml
<attr name="colorSurfaceContainerLow" format="color" />
<attr name="colorPrimary" format="color" />
<attr name="colorTextBody" format="color" />
<attr name="colorTextTitle" format="color" />
<attr name="colorOnSurface" format="color" />
```
在 `Theme.DogeMobile` 里赋值（如 `#262626`/`#8AB4F8`/`#E8E8E8`…），KleanBot 的 XML 即可原样用。
</details>

### 冲突 2（已消解）：ViewBinding

KleanBot 用 ViewBinding；doge-code 用 findViewById。**由于适配器本身不移**，
`TypingCursorSpan` 是 View 无关的 `ReplacementSpan`（只用 Canvas/Paint），**不涉及 Binding**。

### 冲突 3（仍成立）：光标色值口径

`TypingCursorSpan` 原实现从 `?attr/colorOnSurface` 取色（M3）。doge-code 无此属性。
**对策**：直接传 doge-code 现有正文色常量 `0xFFE8E8E8`（见 `ChatAdapter.bindStreaming` 里
`bubble.setTextColor(0xFFE8E8E8)`）—— 与气泡文字同色，视觉一致。

### 冲突 4（仍成立）：网络层/ViewModel（不建议整搬）

KleanBot 的网络层（`DataSourceRemoteOpenAI` + `UseCaseOpenAI` + `ViewModelOpenAI`）是
**直连 OpenAI API**；doge-code 走**自己的桥接协议**（`BridgeClient`/`RemoteAgentBackend`）
与 `ProviderClient`（本地模式）。**不搬**。

---

## 4. 分阶段实施计划（**已按 §2.1 实测差距重排**）

> 原则：每阶段可独立编译 + 截图验收。因真正缺口很小，**整个工程 2~3 个阶段即可完成**。
> 每阶段结束必须：`_check.bat` 通过 + `_apk.bat` 通过 + 真机截图 + 相关单测。

### 阶段 1：呼吸光标（**核心，唯一硬需求**）
- [ ] 拷 `TypingCursorSpan.kt` → `com.dogecode.mobile.TypingCursorSpan`（改包名，实现零改动）
- [ ] 在 `ChatAdapter.bindStreaming()` 里：
  - 用 `SpannableStringBuilder` + `renderMarkdown(text)` 拼出正文
  - 末尾 `setSpan(cursorSpan, ...)`，用 `ValueAnimator` 驱动 `scale`（`MIN_SCALE`↔`MAX_SCALE` 呼吸）
  - **光标颜色**取 doge-code 现有正文色 `0xFFE8E8E8`（不引 `?attr/colorOnSurface`）
  - **density** 用 `bubble.resources.displayMetrics.density`（勿用 textSize 近似）
  - 动画生命周期：`onViewRecycled` / 预览结束时 `cancel()`，避免泄漏
- [ ] 复用 KleanBot `AdapterOpenAI.renderTypingFrame` 的**稳定前缀缓存**思路（`\n\n` 边界）——仅当长回复卡顿时才加
- [ ] **验证**：真机看到「生成中…」旁有呼吸圆点；回复结束光标消失；切页/滚屏不泄漏

### 阶段 2：图标与状态布局（可选增强）
- [ ] 拷 `ic_send.xml`、`ic_stop.xml` → `res/drawable/`（**直接可用，无依赖**）
- [ ] 把 `fragment_chat.xml` 输入栏的 `@android:drawable/ic_menu_send` 等系统图标换成新图标
- [ ] 拷 `ic_robot.png` → `res/drawable/`（用途见 D6）
- [ ] （可选）移植 `item_ai_chat_loading.xml`（三点跳动）替代当前纯文字「生成中…」
- [ ] （可选）移植 `item_ai_chat_placeholder.xml`（空态）/ `item_ai_chat_error.xml`
- [ ] **验证**：截图确认图标清晰、空态/错误态正常

### 阶段 3：逐字动画（可选增强）
- [ ] 评估是否给流式预览加 `TypeWriter` 式逐字效果（当前是整段刷新）
- [ ] 若加：复用 `AdapterOpenAI` 的 `typingRunnable`（12ms/2 字符），注意与 markdown 重渲染的性能
- [ ] **验证**：长回复不掉帧（可用 `adb shell dumpsys gfxinfo` 看帧时间）

### （不建议实施）
- 网络层 / ViewModel / 设置页 / 历史存储 / Markdown 格式化 / 气泡布局本体 —— **均已有等价实现，移植会引入重复**

---

## 4-旧. 初稿分阶段计划（**保留备查，已被 §4 取代**）

<details>
<summary>点击展开初稿（基于错误前提：以为 doge-code 无 markdown/流式/drawable）</summary>

### 阶段 0：准备（无代码改动）
- 读 `viewchat/app/build.gradle.kts`（依赖）✅ 已完成，见 §1.5
- 读 `strings.xml` / `values-night/`（文案）
- 备份 `D:\doge-code\android`（git 已跟踪，确认工作区干净）

### 阶段 1：A 级纯逻辑工具类（零 UI 风险）
- 拷贝 `MarkdownLiteFormatter` / `TypingCursorSpan` / `NestedScrollViewExtensions` / `InternetManager`
- ⚠️ **实测后修正**：`MarkdownLiteFormatter` 与 doge-code 已有实现重叠，**不必移**

### 阶段 2：主题属性映射
- 在 `themes.xml` 声明 `colorSurfaceContainerLow`/`colorPrimary`/`colorTextBody`/`colorTextTitle`/`colorOnSurface`
- ⚠️ **实测后修正**：doge-code 有 13 个自有 `bubble_*.xml`，**不需要** KleanBot 的 `bg_shape_*.xml`

### 阶段 3：气泡布局移植
- ⚠️ **实测后修正**：doge-code 已有气泡布局与样式，**不必移**

### 阶段 4：流式渲染适配器
- ⚠️ **实测后修正**：`ChatAdapter.bindStreaming` **已实现**，只需补呼吸光标

### 阶段 5：集成与收尾
- 空态/错误态接入、markdown 应用、单测、文档

</details>

---

## 5. 待决策点（实施前需确认）

> 经 §2.1 实测修正，原 6 个决策点缩减为 **3 个真正需要定的**。

### 必答

| # | 决策 | 选项 | 建议 |
|---|---|---|---|
| **D1** | 是否加**呼吸光标**（唯一硬需求）| 加／不加 | **加**（`TypingCursorSpan` 零依赖、~30 行集成）|
| **D2** | 光标**颜色** | 跟正文色 `#E8E8E8`／跟主题蓝 `#8AB4F8` | 正文色（与文字一致更自然）|
| **D3** | 是否**换图标**（发送/停止/机器人）| 换（拿 KleanBot 的）／保留系统图标 | **换**（`ic_send`/`ic_stop` 直接可用）|

### 可选（增强项，可后定）

| # | 决策 | 选项 | 建议 |
|---|---|---|---|
| D4 | 是否加**逐字动画** | 加（`TypeWriter` 式）／不加（保持整段刷新）| 先不加，光标已足够表达「生成中」|
| D5 | 是否补**空态/错误态/三点加载布局** | 补／不补 | 看现状空态是否刺眼 |
| D6 | `ic_robot.png` 用途 | 助手头像／启动图／不用 | 待定 |

### 已无争议（实测后作废）

| 原决策 | 结论 |
|---|---|
| ~~Material3 属性方案~~ | **无需**（不搬引 M3 attr 的 XML）|
| ~~是否引入 ViewBinding~~ | **不引**（适配器不移，`TypingCursorSpan` 与 View 无关）|
| ~~是否移植网络层~~ | **不移**（走 doge-code 桥接 + `ProviderClient`）|
| ~~是否移植 Markdown/适配器~~ | **不移**（已有等价实现）|

---

## 6. 移植清单（逐文件勾选，**已按实测精简**）

### ★★★ 建议实施（真实缺口）
- [ ] `presentation/widget/TypingCursorSpan.kt` → `TypingCursorSpan.kt`（改包名，零改动）
- [ ] `ChatAdapter.bindStreaming()` 集成呼吸光标（doge-code 侧改动，~30 行）
- [ ] `drawable/ic_send.xml` → `res/drawable/ic_send.xml`（直接拿）
- [ ] `drawable/ic_stop.xml` → `res/drawable/ic_stop.xml`（直接拿）
- [ ] 输入栏图标替换（`fragment_chat.xml`）

### ★★ 可选增强
- [ ] `drawable/ic_robot.png` → `res/drawable/`（用途待定 D6）
- [ ] `item_ai_chat_loading.xml` → 三点跳动加载态
- [ ] `item_ai_chat_placeholder.xml` → 空态
- [ ] `item_ai_chat_error.xml` → 错误态
- [ ] `TypeWriter.kt` → 逐字动画（评估后定 D4）

### ✗ 不移（doge-code 已有等价实现）

| KleanBot 文件 | doge-code 对应物 |
|---|---|
| `MarkdownLiteFormatter.kt` | `ChatAdapter.parseMarkdown`/`renderMarkdown` |
| `AdapterOpenAI.kt` | `ChatAdapter`（含 `Row.Streaming`/`bindStreaming`）|
| `Message.kt` | `ChatMessage.kt` |
| `OpenAIRole.kt` | `ChatMessage.role: String` |
| `ChatHistoryCodec.kt` / `ChatHistoryStore.kt` | `MessageStore.kt` / `LocalHistoryCodec.kt` |
| `SettingsStore.kt` / `AppSettings.kt` / `Session.kt` | `LocalPrefsStore.kt` / `MainActivity` prefs |
| `DataSourceRemoteOpenAI.kt` | `ProviderClient.kt` / `BridgeClient.kt` |
| `UseCaseOpenAI.kt` | `AgentLoop.kt` / `LocalAgentBackend.kt` |
| `ViewModelOpenAI.kt` / `ViewModelProviderOpenAI.kt` | 无 ViewModel 体系，用 Fragment+宿主 |
| `ApiResponse.kt` | `TurnState.kt` 等 |
| `ActivityHome.kt` | `ChatFragment.kt` |
| `SettingsActivity.kt` | `SettingsFragment.kt` |
| `App.kt` / `MainActivity.kt` / `DIManual.kt` | `MainActivity.kt` |
| `item_home_left/right.xml` | `item_message.xml` + `bubble_*.xml` |
| `bg_shape_rounded_corner_*.xml` | `bubble_assistant/user.xml` |
| `NestedScrollViewExtensions.kt` / `InternetManager.kt` | 视需要（可能已有）|

---

## 7. 验证策略

| 层级 | 手段 |
|---|---|
| 编译 | `android/_check.bat`（compileDebugKotlin）+ `_apk.bat`（assembleDebug）|
| 单测 | `_test.bat`（注意：**当前仓库 test 编译有既有破损**，见 §8）|
| 变异测试 | 对 `MarkdownLiteFormatter` 的 span 偏移、`TypingCursorSpan` 的尺寸口径做注入验证 |
| 真机 | `adb install -r -t --user 0`（MIUI 需 `--user 0`）；截图比对；`logcat` 查 FATAL |
| 视觉 | 逐阶段截图：气泡圆角/配色/光标呼吸/空态/错误态 |
| 回归 | `git diff --stat` 核对改动行数；`grep` 确认无功能代码丢失 |

---

## 8. 已知风险

| 风险 | 说明 | 应对 |
|---|---|---|
| **测试 baseline 破损** | 仓库 `android` 的 `testDebugUnitTest` 当前**编译失败**（`SkillLoopTest`/`AgentOrchestrationTest`/`LocalInferenceEngineTest`/`ProviderProfilesTest` 等既有错误，已用 `git stash` 验证与本次无关）| 移植的新测试**单独跑**；或先修 baseline（另一议题）|
| **工作区有并发改动** | `android/` 下多个文件有未提交改动（含他人会话的 `BeaconProtocol`/`BridgeClient`/`SessionScanner` 等）| 移植前 `git status` 确认；提交时按文件挑选，勿混提 |
| **Material 组件残留** | 若漏改某个 Material 控件，运行时会崩 | 阶段 2 后全量 `grep -r "com.google.android.material" res/layout` |
| **行尾 CRLF/LF** | 编辑大文件可能整体改行尾产生假 diff | 每阶段后 `git diff --stat` 核对 |
| **协议冲突** | 若误搬网络层，会与桥接协议并存导致行为不定 | 严守 §5 D3：不搬网络层 |

---

## 9. 工作量预估（**按实测修正**）

| 阶段 | 内容 | 改动规模 |
|---|---|---|
| 1 | 呼吸光标 | ~70 行新增（`TypingCursorSpan`）+ ~30 行集成 |
| 2 | 图标 + 状态布局 | 2~3 个资源文件 + `fragment_chat.xml` 小改 |
| 3 | 逐字动画（可选）| ~40 行 |
| — | **合计（不含可选）** | **约 100 行 + 2 个资源文件** |

> 对比初稿（估 ~600 行），实测后**缩减到约 1/6** —— 因为 doge-code 已有 markdown、
> 流式预览、气泡布局、历史存储等绝大部分资产。

---

## 10. 下一步

1. 确认 §5 的 **D1/D2/D3**（呼吸光标 / 颜色 / 是否换图标）
2. （已完成）依赖清单见 §1.5；`viewchat/strings.xml` 文案若需合并再补读
3. 从**阶段 1** 开始：拷 `TypingCursorSpan` + 改 `ChatAdapter.bindStreaming`

---

## 附：调研方法与更正记录

| 时间 | 事项 |
|---|---|
| 初稿 | 基于「读代码 + 推测」写就，**误判** doge-code 无 drawable / 无 markdown / 无流式 |
| 更正 | 启动 doge-code 全量调研代理（86 kt / 13 drawable / 73 测试文件），**实测推翻**上述误判 |
| 更正 | `find res -path "*drawable*"` 返回 0 是**查询错误**（路径匹配问题），实际 `ls res/drawable/` 有 13 个文件 |
| 更正 | `ChatAdapter` 内联实现了 `parseMarkdown`/`renderMarkdown`（`Seg.TEXT/BOLD/CODE_BLOCK/CODE_INLINE`），且已有 `streamingPreview`/`Row.Streaming`/`bindStreaming` |
| 结论 | 移植范围从「4 大维度」缩减为「**呼吸光标 + 图标**」两项核心 |
| 2026-10-13 | **源路径更正**：真实路径 `D:\.github\mobile\KleanBot\`（非 `gpt_mobile\viewchat`） |
| 2026-10-13 | **阶段 1 已实施**：`TypingCursorSpan` + `ChatAdapter.withTypingCursor`/`startCursorAnimation` + `onViewRecycled` 停动画（此前工作完成） |
| 2026-10-13 | **阶段 2 已实施**：`ic_send.xml`/`ic_stop.xml` 图标 + `chat_empty_view` 空态（提交 ba828f7dc） |
| 2026-10-13 | **踩坑**：改 `res/layout/` 后增量编译会残留不一致的 merged 资源 → APK 内布局与 R 类不匹配 → 启动崩 `findViewById must not be null`。**改布局后必须全量重编**（删 `app/build`） |
