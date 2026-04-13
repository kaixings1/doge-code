# Buddy 命令完整修复报告

## 问题描述
添加 buddy 模块后,启动 `bun run dev` 卡死在 `[action] Commands and agents loaded`。

## 根本原因分析

Buddy 模块是复制过来的代码,存在多个问题:

### 1. 导入路径错误 (4处)
- `src/utils/attachments.ts` → `'../commands/buddy/prompt.js'` (错误)
- `src/utils/messages.ts` → `'../commands/buddy/prompt.js'` (错误)  
- `src/components/PromptInput/PromptInput.tsx` → `'../../commands/buddy/CompanionSprite.js'` (错误)
- `src/screens/REPL.tsx` → `'../commands/buddy/CompanionSprite.js'` (错误)

**正确路径**: buddy 模块在 `src/buddy/`,不是 `src/commands/buddy/`

### 2. 循环依赖问题
`src/buddy/prompt.ts` 导入了 `../utils/attachments.js` 的类型,而 `attachments.ts` 又导入了 `../buddy/prompt.js`,形成循环依赖。

**修复**: 在 `prompt.ts` 中内联定义 `CompanionIntroAttachment` 类型,移除对 `attachments.ts` 的导入。

### 3. 缺少 Feature Flag 保护
`src/commands.ts` 中 buddy 命令无条件加载,导致循环依赖和初始化问题。

**修复**: 添加 `feature('BUDDY')` 条件保护。

### 4. React Compiler 编译产物问题 (关键!)
`src/buddy/useBuddyNotification.tsx` 和 `src/buddy/CompanionSprite.tsx` 使用了不存在的 `react/compiler-runtime`,这是 React Compiler 编译后的产物,不应该直接放在源码中。

**修复**: 将两个文件改写为普通 React 源码,移除 `_c()` 编译产物代码,改用标准 React hooks。

### 5. 自定义需求修改
- 所有属性改为 100 点满值
- 传奇级伙伴必戴皇冠

## 修复的文件

| 文件 | 修改内容 |
|------|---------|
| `src/utils/attachments.ts` | 导入路径 `../commands/buddy/prompt.js` → `../buddy/prompt.js` |
| `src/utils/messages.ts` | 导入路径 `../commands/buddy/prompt.js` → `../buddy/prompt.js` |
| `src/buddy/prompt.ts` | 内联 `CompanionIntroAttachment` 类型,移除循环依赖 |
| `src/commands.ts` | 添加 `feature('BUDDY')` 条件保护 |
| `src/buddy/useBuddyNotification.tsx` | 移除 `react/compiler-runtime`,改写为标准 React |
| `src/buddy/CompanionSprite.tsx` | 移除 `react/compiler-runtime`,改写为标准 React |
| `src/components/PromptInput/PromptInput.tsx` | 导入路径 `../../commands/buddy/` → `../../buddy/` |
| `src/screens/REPL.tsx` | 导入路径 `../commands/buddy/` → `../buddy/` |
| `src/buddy/companion.ts` | `rollStats()` 全改为 100,传奇必戴皇冠 |

## 验证结果

✅ CLI version 命令正常  
✅ Buddy 模块独立加载正常  
✅ 伙伴生成和精灵渲染正常  
✅ 所有属性 100/100  
✅ 传奇级伙伴必戴皇冠  
✅ 启动不再卡死
