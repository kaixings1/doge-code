---
name: fixing-metadata
description: "审计和修复 HTML 元数据，包括页面标题、meta 描述、规范 URL、Open Graph 标签、Twitter 卡片、favicon、JSON-LD 结构化数据和 robots 指令。适用于添加或审查 SEO 和社交媒体元数据。"
risk: safe
source: community
version: 1.0.1
license: MIT
---

## 工作流

1. 识别缺少或不正确元数据的页面（标题、描述、规范URL、OG标签）
2. 根据下面的优先级规则进行审计 — 先修复关键问题（重复、索引）
3. 确保标题、描述、规范URL和og:url相互一致
4. 验证社交媒体卡片在真实URL上正确渲染，而不是localhost
5. 保持差异最小且仅限于元数据 — 不要重构不相关的代码

## 使用场景
在以下情况下参考这些指南：
- 添加或更改页面标题、描述、规范URL、robots
- 实现Open Graph或Twitter卡片元数据
- 设置favicon、应用图标、manifest、theme-color
- 构建共享SEO组件或布局元数据默认值
- 添加结构化数据（JSON-LD）
- 更改区域设置、替代语言或规范路由
- 发布新页面、营销页面或可分享链接

## 按优先级的规则分类

| 优先级 | 类别 | 影响 |
|----------|----------|--------|
| 1 | correctness and duplication | critical |
| 2 | title and description | high |
| 3 | canonical and indexing | high |
| 4 | social cards | high |
| 5 | icons and manifest | medium |
| 6 | structured data | medium |
| 7 | locale and alternates | low-medium |
| 8 | tool boundaries | critical |

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和架构合规性 |

### 1. correctness and duplication (critical)

- define metadata in one place per page, avoid competing systems
- do not emit duplicate title, description, canonical, or robots tags
- metadata must be deterministic, no random or unstable values
- escape and sanitize any user-generated or dynamic strings
- every page must have safe defaults for title and description

### 2. title and description (high)

- every page must have a title
- use a consistent title format across the site
- keep titles short and readable, avoid stuffing
- shareable or searchable pages should have a meta description
- descriptions must be plain text, no markdown or quote spam

### 3. canonical and indexing (high)

- canonical must point to the preferred URL for the page
- use noindex only for private, duplicate, or non-public pages
- robots meta must match actual access intent
- previews or staging pages should be noindex by default when possible
- paginated pages must have correct canonical behavior

### 4. social cards (high)

- shareable pages must set Open Graph title, description, and image
- Open Graph and Twitter images must use absolute URLs
- prefer correct image dimensions and stable aspect ratios
- og:url must match the canonical URL
- use a sensible og:type, usually website or article
- set twitter:card appropriately, summary_large_image by default

### 5. icons and manifest (medium)

- include at least one favicon that works across browsers
- include apple-touch-icon when relevant
- manifest must be valid and referenced when used
- set theme-color intentionally to avoid mismatched UI chrome
- icon paths should be stable and cacheable

### 6. structured data (medium)

- do not add JSON-LD unless it clearly maps to real page content
- JSON-LD must be valid and reflect what is actually rendered
- do not invent ratings, reviews, prices, or organization details
- prefer one structured data block per page unless required

### 7. locale and alternates (low-medium)

- set the html lang attribute correctly
- set og:locale when localization exists
- add hreflang alternates only when pages truly exist
- localized pages must canonicalize correctly per locale

### 8. tool boundaries (critical)

- prefer minimal changes, do not refactor unrelated code
- do not migrate frameworks or SEO libraries unless requested
- follow the project's existing metadata pattern (Next.js metadata API, react-helmet, manual head, etc.)

## review guidance

- fix critical issues first (duplicates, canonical, indexing)
- ensure title, description, canonical, and og:url agree
- verify social cards on a real URL, not localhost
- prefer stable, boring metadata over clever or dynamic
- keep diffs minimal and scoped to metadata only

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
