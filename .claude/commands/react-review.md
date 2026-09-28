---
description: 针对 hook 正确性、渲染性能、服务端/客户端组件边界、无障碍和 React 专属安全性的全面 React/JSX 代码审查。调用 react-reviewer 代理（并在 TSX/JSX 变更时同时调用 typescript-reviewer）。
---

# React 代码审查

此命令调用 **react-reviewer** 代理进行 React 专属代码审查。对于触及 `.tsx`/`.jsx` 文件的拉取请求，`react-reviewer` 和 `typescript-reviewer` 都应运行 —— 各自负责不同的赛道。

## 此命令做什么

1. **识别 React 变更**：通过 `git diff` 查找修改过的 `.tsx`/`.jsx` 文件（以及包含 React 的 `.ts`/`.js` 文件）
2. **运行 Lint**：执行带 `eslint-plugin-react-hooks` 和 `eslint-plugin-jsx-a11y` 的 `eslint`
3. **类型检查**：运行 `tsc --noEmit` 或项目规范的类型检查命令
4. **只审查 React 赛道**：hook 规则、RSC 边界、无障碍、渲染性能、React 专属安全性
5. **生成报告**：按严重程度归类问题（CRITICAL / HIGH / MEDIUM）

## 何时使用

在以下情况使用 `/react-review`：

- PR 或提交触及 `.tsx`/`.jsx` 文件
- 编写或修改 React 组件、自定义 hook 或页面之后
- 合并 React 代码之前
- 审计 UI 组件的无障碍性
- 审查新 hook 的 hook 规则和依赖正确性
- 审计 Next.js App Router 的服务端/客户端组件边界

对于不带 React 导入的纯 `.ts`/`.js` 变更，使用 `/code-review`（通用）或直接调用 `typescript-reviewer`。

## 与 `/code-review` 及 TypeScript 审查的范围划分

| 工具 | 范围 |
|---|---|
| `react-reviewer`（本命令） | hook 规则、JSX、RSC、a11y、React 专属安全性、渲染性能 |
| `typescript-reviewer` | 通用 TS/JS —— `any` 滥用、异步正确性、Node 安全性 |
| `security-reviewer` | 项目级安全审计 |
| `/code-review` | 对未提交变更或 PR 的通用审查 |

在 TSX/JSX PR 上，同时调用 `react-reviewer` 和 `typescript-reviewer`。两者的发现按设计不重叠。

## 审查类别

### CRITICAL（必须修复）

- 对未净化的输入使用 `dangerouslySetInnerHTML`
- `href`/`src` 使用未校验的用户 URL（`javascript:`、`data:`）
- 未经输入校验的 Server Action
- 客户端包中的密钥（`NEXT_PUBLIC_*`、`VITE_*`、`REACT_APP_*`）
- 用 `localStorage`/`sessionStorage` 存储会话令牌
- 条件式 hook 调用（违反 Hook 规则）
- 直接修改 state
- 在组件或自定义 hook 之外调用 hook

### HIGH（应当修复）

- 缺少 `useEffect`/`useMemo`/`useCallback` 依赖（无正当理由禁用 `exhaustive-deps`）
- 用 Effect 处理派生状态
- Effect 缺少清理
- 处理器/定时器中的陈旧闭包
- 客户端组件中的服务端专属导入
- 通过 props 向客户端组件泄露敏感数据
- Server Actions 缺少鉴权检查
- 无障碍违规（缺少标签、非语义化交互元素、ARIA 误用）
- 动态列表中使用 `key={index}`
- 重复的 state、useEffect 链

### MEDIUM（考虑）

- 没有实测收益的过度 memo 化
- 向已 memo 化的子组件内联传入新对象/函数作为 prop
- 仅在路由根部使用 Suspense（无渐进式呈现）
- 长列表未使用虚拟化
- 通过 `useContext` 传递高频变化的值
- 在非平凡表单中自造校验逻辑
- prop 逐层透传超过 3 层
- 组件超过 200 行
- 新代码中使用 class 组件

## 运行的自动化检查

```bash
# Lint (required for any meaningful review)
npx eslint . --ext .tsx,.jsx,.ts,.js

# Typecheck (skip cleanly for JS-only projects)
npm run typecheck --if-present
[ -f tsconfig.json ] && tsc --noEmit -p tsconfig.json

# Targeted a11y rules
npx eslint . --rule 'jsx-a11y/alt-text: error' \
              --rule 'jsx-a11y/anchor-is-valid: error' \
              --rule 'jsx-a11y/click-events-have-key-events: error'

# Supply-chain
npm audit
```

如果未配置 `eslint-plugin-react-hooks` 或 `eslint-plugin-jsx-a11y`，审查会把该缺口标记为 HIGH 级配置问题并继续。

## 使用示例

````text
User: /react-review

Agent:
# React Code Review Report

## Files Reviewed
- src/components/UserCard.tsx (modified)
- src/hooks/useUser.ts (new)

## Lint Results
PASS: eslint clean
PASS: typecheck clean

## Issues Found

[CRITICAL] Unsanitized dangerouslySetInnerHTML
File: src/components/UserCard.tsx:42
Issue: User-controlled bio rendered as raw HTML.
Why: XSS via stored script tags in user input.
Fix: Sanitize with DOMPurify or render as text:
```tsx
import DOMPurify from "isomorphic-dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(user.bio) }} />
```

[HIGH] Effect cleanup missing
File: src/hooks/useUser.ts:18
Issue: `fetch` call without AbortController; setState on unmounted component possible.
Fix: Add AbortController and cleanup:
```ts
useEffect(() => {
  const ac = new AbortController();
  fetch(`/api/users/${id}`, { signal: ac.signal })
    .then(r => r.json())
    .then(setUser);
  return () => ac.abort();
}, [id]);
```

## Summary
- CRITICAL: 1
- HIGH: 1
- MEDIUM: 0

Recommendation: FAIL: Block merge until CRITICAL issue is fixed
````

## 批准标准

| Status | Condition |
|---|---|
| PASS: Approve | 没有 CRITICAL 或 HIGH 问题 |
| WARNING: Warning | 仅有 MEDIUM 问题（谨慎合并） |
| FAIL: Block | 发现 CRITICAL 或 HIGH 问题 |

## 与其他命令的集成

- 如果构建已损坏，先运行 `/react-build`
- 运行 `/react-test` 确保组件测试通过
- 合并前运行 `/react-review`
- 同一 PR 上非 React 专属的问题使用 `/code-review`

## 相关

- Agent：`agents/react-reviewer.md`
- 配套 Agent：`agents/typescript-reviewer.md`（TSX/JSX PR 时一并运行）
- Skills：`skills/react-patterns/`, `skills/react-testing/`, `skills/accessibility/`
- Rules：`rules/react/`
