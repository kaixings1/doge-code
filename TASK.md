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

---

## P1 — 计划阶段（中风险）

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
