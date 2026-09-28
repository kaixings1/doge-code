---
description: 针对 Composition API 正确性、响应式、composable 模式、模板安全、无障碍和 Vue 专属性能的全面 Vue.js 代码审查。调用 vue-reviewer 代理（并在 .vue/.ts 变更时同时调用 typescript-reviewer）。
---

# Vue 代码审查

此命令调用 **vue-reviewer** 代理进行 Vue 专属代码审查。对于触及 `.vue` 文件或包含 Vue 的 `.ts`/`.js` 文件的拉取请求，`vue-reviewer` 和 `typescript-reviewer` 都应运行 —— 各自负责不同的赛道。

## 此命令做什么

1. **识别 Vue 变更**：通过 `git diff` 查找修改过的 `.vue` 文件和 Vue 相关的 `.ts`/`.js` 文件
2. **运行 Lint**：执行带 `eslint-plugin-vue` 的 `eslint`
3. **类型检查**：运行 `vue-tsc --noEmit` 或项目规范的类型检查命令
4. **只审查 Vue 赛道**：响应式、composables、模板安全、无障碍、Vue 专属性能
5. **生成报告**：按严重程度归类问题（CRITICAL / HIGH / MEDIUM）

## 何时使用

在以下情况使用 `/vue-review`：

- PR 或提交触及 `.vue` 文件
- 编写或修改 Vue 组件、composables 或 Pinia store 之后
- 合并 Vue 代码之前
- 审计模板安全（`v-html`、URL 绑定）
- 审查新 composable 的正确性
- 审计 Vue Router 守卫与导航
- 审查 Nuxt 服务端路由或 SSR 专属代码

对于不带 Vue 导入的纯 `.ts`/`.js` 变更，使用 `/code-review`（通用）或直接调用 `typescript-reviewer`。

## 与 `/code-review` 及 TypeScript 审查的范围划分

| 工具 | 范围 |
|---|---|
| `vue-reviewer`（本命令） | 响应式、composables、模板安全、a11y、Vue 性能、Pinia/Router |
| `typescript-reviewer` | 通用 TS/JS —— `any` 滥用、异步正确性、Node 安全性 |
| `security-reviewer` | 项目级安全审计 |
| `/code-review` | 对未提交变更或 PR 的通用审查 |

在 `.vue` / Vue 相关的 PR 上，同时调用 `vue-reviewer` 和 `typescript-reviewer`。两者的发现按设计不重叠。

## 审查类别

### CRITICAL（必须修复）

- 对未净化的输入使用 `v-html`
- `:href`/`:src` 使用未校验的用户 URL（`javascript:`、`data:`）
- 客户端包中的密钥（`VITE_*`、Nuxt `public` runtimeConfig）
- 未经输入校验的服务端端点（Nuxt Nitro）
- 用 `localStorage`/`sessionStorage` 存储会话令牌
- 在 Vue < 3.5 中解构响应式 props（破坏响应式）
- `reactive()` 对象被整体替换（破坏 watcher）
- watcher 源追踪的是 ref 对象而非 `.value`

### HIGH（应当修复）

- composable 带有模块作用域副作用
- composable 缺少清理（watcher、interval、listener）
- `v-for` 缺少 `:key` 或使用 `key={index}`
- 同一元素上同时使用 `v-if` 和 `v-for`
- 修改 props
- 缺少 prop 校验
- 路由守卫返回 false 却未重定向
- 在顶层解构 `useRoute().params`（快照）
- `v-model` 绑定到没有 setter 的 computed
- 无障碍违规（缺少标签、非语义化交互元素）
- 在 actions 之外直接修改 store 属性

### MEDIUM（考虑）

- 新的 Vue 3 代码中使用 Options API
- 组件超过 300 行
- 该用 `v-if` 却用 `v-show`（或反之）
- `<KeepAlive>` 缺少 `:max`
- 大幅替换的数据缺少 `shallowRef`
- 自造校验而非使用经过检验的表单库
- `defineExpose` 暴露了超出必要的内容
- 使用 `v-bind="$attrs"` 时未禁用 `inheritAttrs`

## 运行的自动化检查

```bash
# Lint (required)
npx eslint . --ext .vue,.ts,.js

# Vue-specific typecheck
vue-tsc --noEmit

# Targeted security rules
npx eslint . --rule 'vue/no-v-html: warn' \
              --rule 'vue/no-template-target-blank: error'

# Supply-chain
npm audit
```

如果未配置 `eslint-plugin-vue` 或 `vue-tsc`，审查会把该缺口标记为 HIGH 级配置问题并继续。

## 使用示例

````text
User: /vue-review

Agent:
# Vue Code Review Report

## Files Reviewed
- src/components/UserCard.vue (modified)
- src/composables/useUser.ts (new)
- src/stores/useUserStore.ts (modified)

## Lint Results
PASS: eslint clean
PASS: vue-tsc clean

## Issues Found

[CRITICAL] Unsanitized v-html
File: src/components/UserCard.vue:15
Issue: User-controlled bio rendered as raw HTML via v-html.
Why: XSS via stored script tags in user input.
Fix: Sanitize with DOMPurify or render as text:
```vue
<script setup>
import DOMPurify from "dompurify";
const safeBio = computed(() => DOMPurify.sanitize(user.bio));
</script>
<template>
  <div v-html="safeBio" />
</template>
```

[HIGH] Watcher in composable missing cleanup
File: src/composables/useUser.ts:22
Issue: `watch` callback fires fetch without AbortController; stale responses can overwrite newer data.
Fix: Use onCleanup to abort:
```ts
watch(userId, async (newId, _old, onCleanup) => {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  const data = await fetch(`/api/users/${newId}`, { signal: controller.signal });
  user.value = await data.json();
});
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

- 如果构建已损坏，先运行项目的构建命令
- 运行测试以确保组件测试通过
- 在合并 Vue 代码前运行 `/vue-review`
- 同一 PR 上非 Vue 专属的问题使用 `/code-review`

## 相关

- Agent：`agents/vue-reviewer.md`
- 配套 Agent：`agents/typescript-reviewer.md`（Vue 相关 TS/JS 时一并运行）
- Skills：`skills/vue-patterns/`
- Rules：`rules/vue/`
