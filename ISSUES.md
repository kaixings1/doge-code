# ISSUES: `command.load is not a function` 修复计划

> **状态更新 (2026-08-04)**: ✅ 已全部修复。实际影响面远大于最初分析的 9 个文件 —— 全量扫描发现 **106 个命令文件**使用错误的 `call` 直接附加模式。已全部替换为 `load: () => Promise.resolve({ call })` 模式（与 `complete` 命令的参考实现一致）。另修复 `api-debug`/`api-doc`/`docker-sandbox` 的错误 load 模式。类型检查新增错误 0，消除错误 63 个。

## 依赖图

```
Pre-factoring: 类型系统加固
  ├── Slice 1: bookmark 命令修复 ✅
  ├── Slice 2: workspace 命令修复 ✅
  ├── Slice 3: wiki 命令修复 ✅
  ├── Slice 4: blame 命令修复 ✅
  └── Slice 5: desktop 命令修复 ✅
        └── Slice 6: 审计与回归防护 ⚠️ 部分完成（脚本检查已做，CI 集成未做）
```

## 问题描述

错误 `TypeError: command.load is not a function` 发生在 `processSlashCommand.tsx` 第 755 和 819 行。

**根因**：部分 `type: 'local'` 的命令对象直接包含 `call` 属性，而没有 `load()` 方法。`processSlashCommand.tsx` 的 `case 'local':` 分支期望通过 `command.load()` 懒加载返回带有 `call` 的模块，但 `load` 不存在。

**类型定义** (`src/types/command.ts`):
- `LocalCommand` 要求 `load: () => Promise<LocalCommandModule>` (其中 `LocalCommandModule = { call: LocalCommandCall }`)
- 但部分命令使用 `call: call as unknown as Command['call']` 直接附加在命令对象上，绕过了类型检查

**`desktop/src/commands/complete/index.ts` 正确的模式**:
```typescript
load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
```

**实际受影响范围**: 106 个命令文件（`src/commands/` 与 `desktop/src/commands/`），远超最初识别的 9 个。

---

## ✅ 修复记录 (2026-08-04)

### 1. 批量修复 105 个命令文件 + 手动修复 blame

将 `call: call as unknown as Command['call']` 统一替换为 `load: () => Promise.resolve({ call: call as unknown as Command['call'] })`。

### 2. 修复错误 load 模式 (上次提交引入)

| 文件 | 问题 | 修复 |
|------|------|------|
| `src/commands/api-debug/index.ts` | `load: () => import('./index.js')` 返回模块命名空间非 `{ call }`；`arguments`/`call` 属性残留 | 统一为 `load: () => Promise.resolve({ call })`，移除 `arguments`/`call` |
| `desktop/src/commands/api-debug/index.ts` | 同上 | 同上 |
| `src/commands/api-doc/index.ts` | `load: () => import('./index.ts')`；call 标注 `LocalJSXCommandCall` 但签名为 `(args)` | call 改为 `LocalCommandCall`；load 改为 `Promise.resolve({ call })`；补 `supportsNonInteractive` |
| `desktop/src/commands/api-doc/index.ts` | 同上 | 同上 |
| `src/commands/docker-sandbox/index.ts` | `load: () => import('./docker-sandbox.tsx')`，模块无 `call` 导出（只有 `dockerSandboxUI`） | 改为 `.then(m => ({ call: m.dockerSandboxUI }))` |
| `desktop/src/commands/docker-sandbox/index.ts` | 同上 | 同上 |

### 3. 验证结果

- 类型检查 `bun run tsc --noEmit --skipLibCheck`: **新增错误 0，消失错误 63**
- 单元测试 `bun run test`: **3/3 通过**

---

## Slice 0: Pre-factoring — 类型系统加固

**状态**: ⚠️ 部分完成

**验收标准**:
- [x] `Command` 类型定义中，`LocalCommand` 的 `load` 属性被标记为必需（已是）
- [ ] 考虑新增 `DisallowCallOnCommand` 类型守卫（未做，用批量脚本检查替代）
- [x] 所有受影响命令的 `call: call as unknown as Command['call']` 模式被替换为 `load: () => Promise.resolve({ call })`
- [x] 类型检查通过：无新增错误

---

## Slice 1: bookmark 命令修复

**状态**: ✅ 已完成

**验收标准**:
- [x] `src/commands/bookmark/index.ts` 中添加 `load: () => Promise.resolve({ call })`
- [x] 移除 `call: call as unknown as Command['call']` 直接属性
- [x] 类型检查通过

---

## Slice 2: workspace 命令修复

**状态**: ✅ 已完成

**验收标准**:
- [x] `src/commands/workspace.ts` 中添加 `load: () => Promise.resolve({ call })`
- [x] 移除 `call: call as unknown as Command['call']` 直接属性
- [x] 类型检查通过

---

## Slice 3: wiki 命令修复

**状态**: ✅ 已完成

**验收标准**:
- [x] `src/commands/wiki/index.ts` 中添加 `load: () => Promise.resolve({ call })`
- [x] 移除 `call: call as unknown as Command['call']` 直接属性
- [x] 类型检查通过

---

## Slice 4: blame 命令修复

**状态**: ✅ 已完成

**验收标准**:
- [x] `src/commands/blame/index.ts` 中添加 `load: () => Promise.resolve({ call })`
- [x] 移除 `call: call as unknown as Command['call']` 直接属性
- [x] 类型检查通过

---

## Slice 5: desktop 命令修复

**状态**: ✅ 已完成（且扩展到全部 desktop 命令）

**验收标准**:
- [x] `desktop/src/commands/api-debug/index.ts` 添加 `load`
- [x] `desktop/src/commands/background/index.ts` 添加 `load`
- [x] `desktop/src/commands/auto-commit/index.ts` 添加 `load`
- [x] `desktop/src/commands/autocomplete/index.ts` 添加 `load`
- [x] `desktop/src/commands/bookmark/index.ts` 添加 `load`
- [x] `desktop/src/commands/workspace.ts` 添加 `load`
- [x] `desktop/src/commands/wiki/index.ts` 添加 `load`
- [ ] 桌面版构建通过（需单独验证）
- [ ] 每个修复的命令均可正常执行（需运行时验证）

---

## Slice 6: 审计与回归防护

**状态**: ⚠️ 部分完成

**验收标准**:
- [x] 用脚本扫描所有 `type: 'local'`/`local-jsx` 命令是否缺少 `load`（一次性脚本，已完成，106 个文件全部修复）
- [ ] 或添加 lint 规则禁止在 `local`/`local-jsx` 命令上直接使用 `call` 属性（未做）
- [ ] CI 中添加对应的检查步骤（未做）
- [ ] 编写单元测试，验证 `processSlashCommand.tsx` 中 `local` 类型命令的 `load` 调用路径（未做）

---

## 遗留事项

1. **Slice 6 完成**: 添加 lint 规则（`@typescript-eslint/no-unsafe-member-access` 或自定义规则）+ CI 检查
2. **运行时验证**: 实际执行 `/bookmark`、`/workspace`、`/wiki`、`/blame` 等命令确认无运行时错误
3. **桌面版构建**: 验证 desktop 端编译通过
