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

### [ ] 2. commands.ts 动态注册改造
- **文件**: `src/commands.ts` → `src/commands/`
- **目标**: 100+ 静态导入改为动态扫描 `commands/` 目录自动注册
- **原则**: 新命令无需修改主文件，遵循 OCP

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

### [ ] 4. tools.ts 条件加载标准化
- **文件**: `src/tools.ts`
- **问题**: 11 处 `require()` 动态加载打破循环依赖，模式分散
- **目标**: 统一为 `conditionalImport()` 工具函数
- **验证**: 所有条件工具仍按预期加载/跳过

### [ ] 5. Tool.ts 类型拆分
- **文件**: `src/Tool.ts`（31KB）
- **目标**:
  ```
  src/types/
    ├── tool.ts           # Tool, Tools, ToolInfo
    ├── toolContext.ts    # ToolUseContext, ToolPermissionContext
    ├── toolProgress.ts   # 所有 *Progress 类型
    └── toolPermission.ts # ToolPermissionRulesBySource
  ```

---

## P3 — 待评估（中风险）

### [ ] 6. core.ts 迁移/移除
- **文件**: `src/core.ts`（34KB，GrowthBook SDK）
- **问题**: 与项目核心（AI CLI）完全无关，放在 src/ 根目录造成混淆
- **操作**: 确认无内部引用后迁移到 `vendor/` 或直接移除

### [ ] 7. query.ts 与 query/ 合并
- **文件**: `src/query.ts`（50KB）+ `src/query/` 目录
- **问题**: 职责边界模糊，逻辑分散在两个位置
- **目标**: 统一归入 `src/query/index.ts`

---

## P4 — 后续增强

### [ ] 8. 测试覆盖增强
- 运行 `bun run test:coverage` 确认当前覆盖率
- 为拆分后的模块补充单元测试

---

## 执行规则

1. **YAGNI 阶梯**: 写代码前停在第一个能成立的阶梯
2. **Diff 级确认**: 每次修改后 `git diff` + grep 关键函数确认功能未丢失
3. **测试先行**: 修改前确认现有测试通过，修改后运行相关测试
4. **最小改动**: 每次只改一个文件/模块，保持可回滚
5. **不凭名字删文件**: 删除前确认无引用
