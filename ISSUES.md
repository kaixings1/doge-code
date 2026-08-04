# ISSUES: `command.load is not a function` 修复计划

## 依赖图

```
Pre-factoring: 类型系统加固
  ├── Slice 1: bookmark 命令修复
  ├── Slice 2: workspace 命令修复
  ├── Slice 3: wiki 命令修复
  ├── Slice 4: blame 命令修复
  └── Slice 5: desktop 命令修复 (5个命令)
        └── Slice 6: 审计与回归防护
```

## 问题描述

错误 `TypeError: command.load is not a function` 发生在 `processSlashCommand.tsx` 第 755 和 819 行。

**根因**：部分 `type: 'local'` 的命令对象直接包含 `call` 属性，而没有 `load()` 方法。`processSlashCommand.tsx` 的 `case 'local':` 分支期望通过 `command.load()` 懒加载返回带有 `call` 的模块，但 `load` 为 `undefined`。

**类型定义** (`src/types/command.ts`):
- `LocalCommand` 要求 `load: () => Promise<LocalCommandModule>` (其中 `LocalCommandModule = { call: LocalCommandCall }`)
- 但部分命令使用 `call: call as unknown as Command['call']` 直接附加在命令对象上，绕过了类型检查

**`desktop/src/commands/complete/index.ts` 正确的模式**:
```typescript
load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
```

**受影响的命令** (`src/` — 4 个):
- `bookmark` — `src/commands/bookmark/index.ts:138`
- `workspace` — `src/commands/workspace.ts:1233`
- `wiki` — `src/commands/wiki/index.ts:1030`
- `blame` — `src/commands/blame/index.ts:104`

**受影响的命令** (`desktop/` — 5 个):
- `api-debug` — `desktop/src/commands/api-debug/index.ts:377`
- `background` — `desktop/src/commands/background/index.ts:196`
- `auto-commit` — `desktop/src/commands/auto-commit/index.ts:238`
- `autocomplete` — `desktop/src/commands/autocomplete/index.ts:312`
- `bookmark` — `desktop/src/commands/bookmark/index.ts:138`
- `workspace` — `desktop/src/commands/workspace.ts:228`
- `wiki` — `desktop/src/commands/wiki/index.ts:1030`

---

## Slice 0: Pre-factoring — 类型系统加固

**Blocked by**: 无

**用户故事**: 作为开发者，我希望 TypeScript 编译器在编译时就能捕获 `local` 类型命令缺少 `load` 的错误，而不是等到运行时崩溃。

**验收标准**:
- [ ] `Command` 类型定义中，`LocalCommand` 的 `load` 属性被标记为必需（已是），但需要确保 `call` 不能直接作为顶级属性存在
- [ ] 考虑新增 `DisallowCallOnCommand` 类型守卫，或使用 `satisfies` 而非 `as Command` 来确保类型安全
- [ ] 所有受影响命令的 `call: call as unknown as Command['call']` 模式被替换为 `load: () => Promise.resolve({ call })`
- [ ] 类型检查通过：`bun run tsc --noEmit` 无错误

---

## Slice 1: bookmark 命令修复

**Blocked by**: Slice 0

**用户故事**: 作为用户，我希望 `/bookmark` 命令能正常执行，而不是抛出 `TypeError: command.load is not a function`。

**验收标准**:
- [ ] `src/commands/bookmark/index.ts` 中添加 `load: () => Promise.resolve({ call })`
- [ ] 移除 `call: call as unknown as Command['call']` 直接属性
- [ ] 类型检查通过
- [ ] `/bookmark` 命令可正常执行

---

## Slice 2: workspace 命令修复

**Blocked by**: Slice 0

**用户故事**: 作为用户，我希望 `/workspace` 命令能正常执行。

**验收标准**:
- [ ] `src/commands/workspace.ts` 中添加 `load: () => Promise.resolve({ call })`
- [ ] 移除 `call: call as unknown as Command['call']` 直接属性
- [ ] 类型检查通过
- [ ] `/workspace` 命令可正常执行

---

## Slice 3: wiki 命令修复

**Blocked by**: Slice 0

**用户故事**: 作为用户，我希望 `/wiki` 命令能正常执行。

**验收标准**:
- [ ] `src/commands/wiki/index.ts` 中添加 `load: () => Promise.resolve({ call })`
- [ ] 移除 `call: call as unknown as Command['call']` 直接属性
- [ ] 类型检查通过
- [ ] `/wiki` 命令可正常执行

---

## Slice 4: blame 命令修复

**Blocked by**: Slice 0

**用户故事**: 作为用户，我希望 `/blame` 命令能正常执行。

**验收标准**:
- [ ] `src/commands/blame/index.ts` 中添加 `load: () => Promise.resolve({ call })`
- [ ] 移除 `call: call as unknown as Command['call']` 直接属性
- [ ] 类型检查通过
- [ ] `/blame` 命令可正常执行

---

## Slice 5: desktop 命令修复

**Blocked by**: Slice 0

**用户故事**: 作为桌面版用户，我希望所有 `local` 类型命令（api-debug、background、auto-commit、autocomplete、bookmark、workspace、wiki）能正常执行。

**验收标准**:
- [ ] `desktop/src/commands/api-debug/index.ts` 添加 `load`
- [ ] `desktop/src/commands/background/index.ts` 添加 `load`
- [ ] `desktop/src/commands/auto-commit/index.ts` 添加 `load`
- [ ] `desktop/src/commands/autocomplete/index.ts` 添加 `load`
- [ ] `desktop/src/commands/bookmark/index.ts` 添加 `load`
- [ ] `desktop/src/commands/workspace.ts` 添加 `load`
- [ ] `desktop/src/commands/wiki/index.ts` 添加 `load`
- [ ] 桌面版构建通过
- [ ] 每个修复的命令均可正常执行

---

## Slice 6: 审计与回归防护

**Blocked by**: Slice 1-5

**用户故事**: 作为开发者，我希望有自动化手段防止未来再次出现 `local` 类型命令缺少 `load` 的回归问题。

**验收标准**:
- [ ] 在 `src/commands.ts` 或构建脚本中添加静态检查，扫描所有 `type: 'local'` 或 `type: 'local-jsx'` 的命令是否包含 `load` 属性
- [ ] 或添加 lint 规则禁止在 `local`/`local-jsx` 命令上直接使用 `call` 属性
- [ ] CI 中添加对应的检查步骤
- [ ] 编写单元测试，验证 `processSlashCommand.tsx` 中 `local` 类型命令的 `load` 调用路径

---

## 建议实现顺序

1. **Slice 0** (Pre-factoring) — 必须先做，因为类型定义是修复的基础
2. **Slices 1-4** (src 命令) — 可并行执行，互不依赖
3. **Slice 5** (desktop 命令) — 可并行执行，互不依赖
4. **Slice 6** (审计与防护) — 最后做，依赖所有修复完成