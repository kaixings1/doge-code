# KX2API 页面复查报告

- 复查日期：2026-10-11
- 范围：`src/renderer/src/pages/` 下全部 32 个页面源文件（约 12,000 行）
- 方法：**客观工具验证 + 逐行精读**（工具输出为准；不采信未经验证的推测）

---

## 修复状态（2026-10-11 完成）

| 编号 | 问题 | 状态 |
|---|---|---|
| P0-1 | MCP「测试连接」恒报失败 | ✅ 已修（preload 取值改 `r.data.*`） |
| P0-2 | 插件编辑保存不写字段 | ✅ 已修（handler+preload+类型+页面四处对齐） |
| P0-3 | 备份/恢复弹窗空白 | ✅ 已修（Tabs defaultValue 归一） |
| P1-1 | ChatPage 中断按钮无效 | ✅ 已修（新增 `CHAT_ABORT` 全链路 + 删死 ref） |
| P1-2 | ChatPage 流式订阅泄漏 | ✅ 已修（cleanup 收进 ref，卸载统一清理） |
| P1-3 | 工具结果成功/失败靠猜文本 | ✅ 已修（判据收紧为行首状态标记，附 9 例探针验证） |
| P1-4 | ChatPage 未接 i18n | ⏳ 未修（工作量大，建议单独立项） |
| P2 | 30 页 i18n 覆盖不全 | ⏳ 未修（批量任务） |
| P3 | console.log / 死导入 / 死变量 | ✅ 已修（Providers、Plugin x2、OtherConfig、handlers） |

**新增守卫**：`scripts/check-ipc-contract.mjs` 增加「返回值形状」检查 —— preload 取的
字段必须存在于 handler 返回对象字面量。已做变异验证（注入缺陷→脚本报错→还原→通过）。

**验证**：tsc 0 错误 · 单元测试 1460/1460 · IPC 契约一致 · `npm run build` 成功。

---

## 一、客观体检结果（实测命令输出）

| 检查项 | 命令 | 结果 |
|---|---|---|
| TypeScript 类型 | `tsc -p tsconfig.check.json --noEmit` | **0 错误** |
| IPC 三方契约 | `npm run check:ipc` | **一致**（293 常量 / 251 注册 / 38 仅推送） |
| 单元测试 | `npm run test:unit` | **1460/1460 通过**（95 文件） |
| 页面 API 接线（存在性） | 自写脚本比对 pages ↔ preload | **65 个调用点全部命中，0 断裂** |

**注意**：`check:ipc` 只校验"通道存在性"，**不校验返回值的形状**。下文的 P0 正是因此漏网。

---

## 二、真实问题清单

### P0-1 ｜ MCP「测试连接」恒报失败（功能不可用）

- **文件**：`src/main/ipc/handlers.ts:1046`、`src/preload/index.ts:1173-1178`、`src/renderer/src/pages/McpManagement/McpManagementPage.tsx:139-158`
- **证据链**：
  - handler（1046）：`return { success: result.connected, data: result }` — `connected` / `tools` 嵌在 `data` 之下
  - preload（1173-1178）：却取 `r.connected` / `r.tools` / `r.error` → 三者皆为 `undefined`
  - 页面（143）：进入 `if (res.success)` 后 `res.connected` 为真值缺失 → 走「连接失败」；`res.tools.length` 触发 TypeError → catch → toast「测试出错」
- **影响**：MCP 连接测试**永远失败**，即使服务器完全正常。
- **修法**：preload 改为取 `r.data.connected` / `r.data.tools` / `r.data.error`（`r.data` 即 McpConnectionResult）。**只改 preload 一处即可**。

### P0-2 ｜ 插件编辑「保存」不写入任何字段

- **文件**：`src/renderer/src/pages/PluginManagement/PluginDetailPage.tsx:53-58`、`src/main/ipc/handlers.ts:1312-1322`
- **证据链**：
  - 页面（55）：`await pluginsApi.update(id)` — 只传 id
  - 页面（44-49）：`editName` / `editVersion` / `editDescription` / `editAuthor` 收集后**全部被丢弃**
  - handler（1312）：签名 `(_, pluginId: string)`，只做 `pluginsStore.set(id, { ...plugin, updatedAt: Date.now() })`
- **影响**：插件编辑**保存无任何效果**，用户改完点保存等于没改。
- **修法**：`PLUGINS_UPDATE` 增加第二参 `updates`，handler 合并写入；preload 与 `electron.d.ts` 同步签名；页面传入四个字段。

### P0-3 ｜ 备份 / 恢复弹窗主体空白

- **文件**：`src/renderer/src/components/management/ImportExportDialog.tsx:113-117`
- **证据链**：
  - `ioMode` 明确会取 `'backup'` / `'restore'`（McpManagementPage:255-256；Plugin、Task 页同样）
  - 第 113 行 `<Tabs defaultValue={mode}>`，但 TabsList 只有 `export` / `import` 两个 Trigger
  - Radix 找不到匹配值 → 不渲染任何 TabsContent → 弹窗主体空白
- **影响**：4 个管理页的「备份」「恢复」入口点开是**空白弹窗**，用户不知所措。
- **修法**：`defaultValue={mode === 'import' || mode === 'restore' ? 'import' : 'export'}`。

### P1-1 ｜ ChatPage 中断按钮无效（假按钮）

- **文件**：`src/renderer/src/pages/Chat/ChatPage.tsx:965, 1591-1595`
- **证据链**：
  - `abortRef`（965）定义后**从未赋值**（全文仅"定义 + 读取"两处，无赋值）
  - `handleAbort`（1592）只调 `abortRef.current?.abort()` → 永远空操作
  - 引擎侧**有**真实能力：`src/engine/index.ts:509 async abort()`
  - 但 IPC 层**无** `CHAT_ABORT` 通道（只有 pause / resume / getState）
- **影响**：点「中断」只本地 `setIsStreaming(false)`，**主进程 `eng.query` 不停**，后台继续推 chunk → 又追加到已"中止"的消息上。界面与后台状态不一致。
- **修法**：补 `CHAT_ABORT` 通道 → handler 调 `engine.abort()` → preload 暴露 → `handleAbort` 改调 IPC。三处断链需一并接通。

### P1-2 ｜ ChatPage 流式订阅在路由切走时泄漏

- **文件**：`src/renderer/src/pages/Chat/ChatPage.tsx:1376-1474`
- **证据链**：
  - 10 个 `onStream*` 订阅的 cleanup 函数都是 `handleSend`（1334，useCallback）的**函数内局部变量**
  - 唯一卸载 effect（985-989）只清 `flushTimerRef`，不碰这 10 个订阅
  - cleanup 仅在 `onDone / onError / onAborted` 回调内被调——而那三者也要事件到达才触发
- **影响**：流式中点侧栏切页 → ChatPage 卸载，但 `ipcRenderer.on` handler 仍挂在 webContents 上 → 后续 chunk 继续向已卸载组件 `setMessages`（React 警告 + 内存泄漏）。
- **修法**：订阅改为与**组件生命周期**对齐——在 `useEffect` 挂载时集中注册一次，卸载统一 cleanup；而非与单次发送绑定。

### P1-3 ｜ ChatPage 工具结果成功/失败靠猜文本

- **文件**：`src/renderer/src/pages/Chat/ChatPage.tsx:117`
- **证据链**：`const isSuccess = !text.includes('error') && !text.includes('Error') && !text.includes('失败')`
- **影响**：工具输出正文只要出现「error」字样（如 grep 结果里匹配到含 `error` 的源码行，或输出「0 errors」）就被判为失败，亮红叉；而这是**成功的搜索结果**。
- **修法**：成功/失败应由结构化字段决定，而非裸 `includes`。若拿不到结构化标记，至少收紧判据（只匹配独立的状态行）。

### P1-4 ｜ ChatPage 整体未接入 i18n

- **文件**：`src/renderer/src/pages/Chat/ChatPage.tsx`（2155 行）、`src/renderer/src/pages/Chat/promptGroups.ts`（103 行）
- **证据**：ChatPage **93 处**硬编码中文、`t()` 调用 **0 次**；promptGroups **17 处**、`t()` **0 次**；locale 的 46 个命名空间中**没有 `chat` 键**。其余 31 个页面均已接 i18n。
- **影响**：英文用户看到整页中文。
- **修法**：新增 `chat` 命名空间（约 110 key），ChatPage 与 promptGroups 全部走 `t()`。工作量最大，建议单独立项。

---

## 三、P2 — i18n 覆盖不全（已有 i18n 但部分漏翻）

仅列硬编码 ≥20 处的文件：

| 文件 | 硬编码 | t() |
|---|---|---|
| ToolManagementPage.tsx | 115 | 117 |
| Profiles.tsx | 63 | 74 |
| ToolGroupsPanel.tsx | 45 | 46 |
| TeamTaskPage.tsx | 44 | 37 |
| CommandManagementPage.tsx | 42 | 5 |
| TaskManagementPage.tsx | 38 | 17 |
| ToolDetailPage.tsx | 38 | 39 |
| AgentDetailPage.tsx | 34 | 30 |
| McpManagementPage.tsx | 33 | 39 |
| PlanDetailPage.tsx | 33 | 26 |
| PlanManagementPage.tsx | 32 | 21 |
| ToolMetricsPanel.tsx | 30 | 30 |
| （其余 18 个文件各 <30，合计 938 处） | | |

- **注**：`TeamTaskPage.tsx` 的中文多是 **AI 角色 System Prompt 正文**（如「你是 KX2Code 的规划师…」），属业务内容非 UI 文案，不应强制翻译；实际需翻译量小于计数。
- **修法**：优先 toast / 按钮 / 表单校验收可见文案；Prompt 正文可保留。

---

## 四、P3 — 代码质量

| 项 | 文件:行 | 说明 |
|---|---|---|
| `console.log` 残留 | `Providers.tsx:63` | `console.log('electronAPI not available')`，应为 error 级或删除 |
| 死代码 | `ChatPage.tsx:967, 981` | `messagesRef` 定义后从未被读取 |
| 死导入 | `ChatPage.tsx:10` | `useMemo` 导入但全文未用 |
| 死导入 | PluginManagementPage / PluginDetailPage / OtherConfigPage `:1` | `useEffect`/`useCallback` 导入未用 |
| 死变量 | `handlers.ts:1368` | `OTHER_CONFIG_RESET` 内 `const config = ...` 声明后未用 |
| loading 写法不统一 | Prompts/Session/Mcp/Profiles 等 | 用 `try{}catch{}` 后置 `setLoading(false)`，非 `finally`；**不构成卡死**（后续语句无条件执行），但建议统一 |
| 手写 loading 未用公共 hook | 12 个页面 | 已抽 `useAsyncLoad`（10 页在用），可继续迁移 |
| 大列表未虚拟化 | ToolManagementPage / ChatPage 消息列表 | 已装 `react-window`，Chat 已用于别处；可按阈值接入 |
| 导出双份副作用 | McpManagementPage:180-192 / PluginManagementPage:36-48 | 调 `mgmt.export` 落盘后又 Blob 下载，一次导出产生两份 |

---

## 五、测试盲区（重要）

- `McpManagement.test.ts:148` 的 mock **直接返回平铺的** `{success, connected, tools}`，复刻了「preload 本该有的形状」，却不走真实 preload→handler 链路 → **P0-1 测不出**。
- `PluginDetailPage` **无测试** → P0-2 无任何拦截。
- 符合本项目已知风险：「复刻型测试 = 没有测试」。**建议**：为 P0-1/P0-2 补端到端断言（走真实契约），替换复刻型 mock。

---

## 六、建议修复顺序

1. **P0-1**（改 preload 一行）→ 立竿见影
2. **P0-3**（改 defaultValue 一行）
3. **P0-2**（三处签名对齐：handler + preload + 页面）
4. **P1-1**（补 `CHAT_ABORT` 全链路）
5. **P1-2**（订阅生命周期重构）
6. **P1-3**、**P1-4**（判据收紧 / Chat i18n 立项）
7. **P2 / P3** 批量清理

---

## 七、结论

- **功能与接线（存在性）层面**：0 类型错误、0 通道断裂、1460 测试全绿。
- **但存在 3 个 P0 静默失效**（MCP 测试连接 / 插件保存 / 备份弹窗空白），均被"通道存在即通过"的契约检查与复刻型测试掩盖。
- ChatPage 另有中断无效、订阅泄漏、文本猜成功三个 P1，以及未接 i18n。

### 附：被推翻的子代理误报（避免误修）

| 子代理上报 | 实际核对结果 |
|---|---|
| PlanManagementPage "setLoading 异常路径缺失" | 第 112-115 行已改用 `useAsyncLoad`，不存在 |
| ToolManagementPage "P1 无 error 态" | 第 100-112 行有完整 error 态 |
| 多页"只 console.error 不给 error 态" | 扫描确认所有带 console.error 的页面都有 error 态 |

> S3 / S4 两个子代理的报告质量高，其 P0/P1 经我逐行复核**属实**，已采纳。
