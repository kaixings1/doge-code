---
name: seo-content-brief
description: "Seo Content Brief — 生成竞争性 SEO 内容简报的相关功能和最佳实践，含分节字数、竞争对手评分、关键词密度指导和页面类型模板。"
user-invocable: true
argument-hint: "[url-or-keyword] [page-type]"
license: MIT
metadata:
  author: puneetindersingh
  original_author: puneetindersingh
  version: "1.0.0"
  category: seo
---

# SEO 内容简报生成器

生成研究支持的内容简报，帮助作者写出能超越当前顶级结果的页面。简报包括含差距评分的竞争对手分析、分节字数细分、关键词放置规则和特定页面类型模板。

## 流程

### 1. 确定简报模式

**改进模式**（提供现有页面 URL）：
- 获取现有页面内容和结构
- 识别已经强的部分（保留）
- 识别缺失、薄弱或过时的部分
- 在提纲中区分"保留/加强"与"新增"部分
- 当定向改进足以取胜时，不推荐完全重写

**新建页面模式**（提供关键词或主题，无现有页面）：
- 仅使用目标网站的主页或站点地图获取业务上下文
- 从头构建新页面的简报
- 关注新页面可以填补的竞争空白

### 2. Fetch 上下文

- Fetch the target URL or homepage to understand the business
- Fetch the sitemap to discover all existing pages, categories, and services
- This context is critical for the Website Relevance Rule (see below)

### 3. Analyse SERPs

- Identify the top 5 ranking pages for the target keyword
- Filter out non-competitors (Wikipedia, Reddit, Pinterest, Amazon, YouTube, government sites, SEO tool pages, job boards, directories, news aggregators, social platforms). See `references/excluded-domains.md` for the full list.
- Score each real competitor: Depth (1-10), 格式ting (1-10), SEO (1-10), UX (1-10)
- Identify three gap types:
  - **Topic gaps:** subtopics competitors miss entirely
  - **Depth gaps:** topics covered but shallow
  - **Quality gaps:** outdated info, no expert perspective, poor formatting
- Calculate gap priority: `Impact x Competitive Advantage / Effort`

### 4. Classify Search Intent

- **Informational:** user wants to learn (guides, how-tos, definitions)
- **Commercial:** user is researching before buying (comparisons, reviews, "best X")
- **Transactional:** user is ready to act (buy, book, enquire, sign up)
- **Navigational:** user is looking for a specific site or page

Identify what SERP format Google rewards for this query: long-form guide, listicle, comparison table, landing page, 常见问题, video, local pack.

### 5. Build the Brief

Apply the page-type template from `references/page-type-templates.md`, then customise based on competitor gaps and search intent.

## Critical Rules

### Website Relevance Rule

Every heading, subtopic, keyword, and 常见问题 you suggest MUST be something the target website can credibly write about based on its actual services or products.

- Read the site's homepage and sitemap to understand what it does
- Do not borrow competitor structure if those sections cover things this site does not offer
- Before each suggestion, ask: "Can this website actually deliver on this content?" If no, remove it.

### Site Structure Coverage Rule

When briefing a hub, overview, category, or "types of" page:
- The outline MUST reference every relevant product category, service, or sub-page that exists on the site
- Do not invent categories that don't exist, do not leave out categories that do exist
- Each category should appear as its own section with an internal link suggestion
- This ensures the page acts as a proper hub linking to all child pages

For non-hub pages (single service page, blog post), use site structure to suggest relevant internal links but do not force every category into the outline.

### Output Language Rules

- 绝不 mention researcher names, framework names, or tool names in the output (no "Ben Goodey method", "Frase.io formula", "Princeton GEO", "Clearscope", "Backlinko")
- These are internal thinking tools only. The output must read as plain, professional advice.
- Write for a business owner or content writer, not an SEO academic

## Keyword Density and Placement

Read `references/keyword-density.md` for the full rules. 总结:

**Primary keyword density:** 0.5% to 2.0% of total word count.
- Above 2% requires review. Above 3% risks keyword stuffing penalties.
- First 1-2 mentions carry the most SEO weight. Diminishing returns after.
- For a 1,000-word article at 1-2%: roughly 10-20 total appearances including headings, body, and alt text.

**Primary keyword MUST appear in:**
1. Title tag (near the front)
2. H1 tag (near the front)
3. URL slug
4. Meta description
5. First paragraph / first 100 words
6. At least one image alt text

**Primary keyword does NOT need to appear in:**
- Every H2 or H3 (subtopics carry context naturally if H1 covers it)
- Every paragraph or section

**Secondary keywords:**
- 5-8 closely related supporting terms distributed through body content
- 10-15 broader semantic terms covering related concepts
- Use in H2-H6 subheadings where natural
- Synonyms improve readability and do NOT count toward keyword density

**Per-section keyword guidance:** For each section in the outline, specify:
- Which keyword (primary or secondary) belongs in the heading
- Whether the body should include the primary keyword or a variation
- 示例: "Use secondary keyword 'structural drafting services' in H2. Body: mention primary keyword once."

**Distribution:** Spread the primary keyword evenly. Do not front-load or cluster in one section.

## Meta Tag Rules

**Title tag:**
- 50-60 characters (never under 50, never over 60)
- Primary keyword first, brand name last
- Separate brand with a pipe or dash (match the site's existing pattern)
- Lead with outcomes, numbers, or specifics when possible

**Meta description:**
- 130-150 characters (never under 130, never over 150)
- Active voice, expand on the title with USPs and specifics
- End with a call to action
- No brand name at the end (it's already in the title)
- No quotes (Google truncates at quotes)

## Information Gain (non-negotiable)

Every brief must specify EXACTLY what new value this content adds that no current ranking page provides. Must be specific:
- Proprietary data or original research
- Case studies with real outcomes
- Expert quotes or first-hand experience
- Original synthesis or unique framework
- NOT "more detail" or "better formatting"

## E-E-A-T 需求

List the exact trust signals this content needs:
- Author credentials and bio relevant to the topic
- Expert quotes or citations from authoritative sources
- Cited studies, data, or statistics with dates
- Last updated date
- Especially critical for YMYL topics (health, finance, legal, safety)

## Internal Linking

- Suggest 3-5 specific internal link opportunities with anchor text
- Specify whether the page is a hub (links out to cluster pages) or spoke (links to pillar page)
- Use the site structure from the sitemap to find real link targets

## 输出格式

始终 output in this exact structure:

```
## Content Brief: [Primary Keyword]

### Search Intent
[Intent type, SERP format rewarded, target audience and knowledge level. 3-4 lines.]

### Competitor Analysis
| # | URL | Key H2 Sections | Est. Words | Score | Main Gap |