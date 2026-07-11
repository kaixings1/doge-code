---
description: 前端工程评审 — 走过 Matt Pocock 7 个强制问题（设备、LCP 目标、渲染、Bundle 预算、SEO vs 认证、设计系统、WCAG），选择框架+渲染配置，fork 出专项代理（a11y-audit、performance-profiler、epic-design）。调用 cs-frontend-engineer agent 并附带上下文 fork。
argument-hint: "<problem or surface to review>"
---

# /cs:frontend-review — 前端工程评审

使用 `cs-frontend-engineer` 智能体（使用 `context: fork`）处理此查询：

**$ARGUMENTS**

## 强制问题库

规范来源：`engineering-team/skills/senior-frontend/references/forcing_questions.md`（7 个问题，每轮一个，建议 + 规范引用）

1. 主要设备 + 网络（桌面光纤 / 移动 4G / 低端安卓 / 企业网络）
2. 主要设备上的 LCP 目标（毫秒）
3. 服务端组件 vs SPA vs SSR vs SSG
4. 每条路由的 JS 包预算（KB gzip）
5. 依赖 SEO 或需要认证
6. 设计系统位置（Figma + tokens / 临时 Tailwind / headless UI）
7. WCAG 目标（AA / AAA / 尽力而为）+ 无障碍负责人

## 路由协议

1. **遍历 7 个强制问题**，记录在 `engineering-team/skills/senior-frontend/references/forcing_questions.md` 中。每轮一个。附规范引用提出建议。记录到 `/tmp/frontend-grill-<date>.md`。
2. **暴露终止条件**——例如"依赖 SEO + 仅 SPA"触发。停止并解决。
3. **运行确定性配置选择器：**
   ```bash
   python engineering-team/skills/senior-frontend/scripts/frontend_decision_engine.py \
     --primary-device <mobile-4g|desktop-fiber|low-end-android|corporate-network> \
     --lcp-target-ms <N> --seo-dependent <true|false> \
     --auth-walled <true|false> --team-size <N>
   ```
4. **暴露匹配的配置 + 亚军权衡**（如果在 15% 以内）。
5. **分派到专家**（一次一个，深度优先）：
   - `a11y-audit` 用于 WCAG 基线（始终）
   - `performance-profiler` 用于 CWV 基线 + 包审计
   - `epic-design` 仅用于 `astro-or-static` 营销页面
   - `apple-hig-expert` 仅用于 Apple 平台原生页面
   - `dependency-auditor` 在任何主要版本发布前
   - `cs-karpathy-reviewer` 在任何提交前

## 输出期望（≤ 200 字摘要）

- 匹配的配置 + 原因
- 主要设备上 p75 的三个 CWV 目标（LCP、INP、CLS）
- 每条路由的 JS 包预算（KB-gzip）
- 命名的无障碍负责人
- 调用的专家列表 + 工件路径
- 推荐的下一个子技能

## 反模式

- ❌ 推荐 Next App Router 作为通用默认值。设备 + SEO + 认证决定渲染方式。
- ❌ 将"快速"设为目标。选择一个毫秒数。
- ❌ 在面向客户的页面上跳过 `a11y-audit`。
- ❌ 重新实现性能分析逻辑。分派到 `performance-profiler`。

## 自定义

配置文件位于 `engineering-team/skills/senior-frontend/profiles/`。四个内置配置：`next-app-router`、`remix-or-sveltekit`、`vite-spa`、`astro-or-static`。复制一个到 `<your-org>.json` 并调整以添加你组织的默认值。

## 相关命令

- `/cs:fullstack-review` — 全栈视角（父级）
- `/cs:backend-review` — 用于消费者端的 API 契约
- `/cs:engineer-grill` — 跨角色 21 问题审查
- `/karpathy-check` — Karpathy 4 原则审查
