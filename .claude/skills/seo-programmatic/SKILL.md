---
name: seo-programmatic
description: "Seo Programmatic — Seo Programmatic 相关功能和最佳实践"
  程序化 SEO 规划与分析，适用于从数据源大规模生成的页面。
  涵盖模板引擎、URL 模式、内链自动化、内容稀薄防护和索引膨胀预防。
  当用户提到"程序化 SEO"、"大规模页面"、"动态页面"、"模板页面"、
  "生成页面"或"数据驱动 SEO"时使用。
user-invocable: true
argument-hint: "[url or plan]"
license: MIT
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# 程序化 SEO 分析与规划

从结构化数据源大规模构建和审计 SEO 页面。强制执行质量门以防止内容稀薄惩罚和索引膨胀。

## Data Source Assessment

Evaluate the data powering programmatic pages:
- **CSV/JSON files**: Row count, column uniqueness, missing values
- **API endpoints**: Response structure, data freshness, rate limits
- **Database queries**: Record count, field completeness, update frequency
- Data quality checks:
  - Each record must have enough unique attributes to generate distinct content
  - Flag duplicate or near-duplicate records (>80% field overlap)
  - Verify data freshness; stale data produces stale pages

## Template Engine Planning

Design templates that produce unique, valuable pages:
- **Variable injection points**: Title, H1, body sections, meta description, schema
- **Content blocks**: Static (shared across pages) vs dynamic (unique per page)
- **Conditional logic**: Show/hide sections based on data availability
- **Supplementary content**: 相关 items, contextual tips, user-generated content
- Template review checklist:
  - Each page must read as a standalone, valuable resource
  - No "mad-libs" patterns (just swapping city/product names in identical text)
  - Dynamic sections must add genuine information, not just keyword variations

## URL Pattern Strategy

### Common Patterns
- `/tools/[tool-name]`: Tool/product directory pages
- `/[city]/[service]`: Location + service pages
- `/integrations/[platform]`: 集成 landing pages
- `/glossary/[term]`: Definition/reference pages
- `/templates/[template-name]`: Downloadable template pages

### URL Rules
- Lowercase, hyphenated slugs derived from data
- Logical hierarchy reflecting site architecture
- No duplicate slugs; enforce uniqueness at generation time
- Keep URLs under 100 characters
- No query parameters for primary content URLs
- Consistent trailing slash usage (match existing site pattern)

## Internal Linking Automation

- **Hub/spoke model**: Category hub pages linking to individual programmatic pages
- **相关 items**: Auto-link to 3-5 related pages based on data attributes
- **Breadcrumbs**: Generate BreadcrumbList schema from URL hierarchy
- **Cross-linking**: Link between programmatic pages sharing attributes (same category, same city, same feature)
- **Anchor text**: Use descriptive, varied anchor text. Avoid exact-match keyword repetition
- Link density: 3-5 internal links per 1000 words (match seo-content guidelines)

## Thin Content Safeguards

### Quality Gates

| Metric | Threshold | Action |