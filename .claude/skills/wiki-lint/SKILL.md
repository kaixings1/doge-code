---
name: wiki-lint
description: "Wiki Lint — Wiki Lint 相关功能和最佳实践"
  Health check the Obsidian wiki vault. Finds orphan pages, dead wikilinks, stale claims,
  missing cross-references, frontmatter gaps, and empty sections. Creates or updates
  Dataview dashboards. Generates canvas maps. Triggers on: "lint", "health check",
  "clean up wiki", "check the wiki", "wiki maintenance", "find orphans", "wiki audit".
---

# wiki-lint：Wiki 健康检查

每 10-15 次导入后或每周运行一次检查。在自动修复任何内容前先询问。将检查报告输出到 `wiki/meta/lint-report-YYYY-MM-DD.md`。
