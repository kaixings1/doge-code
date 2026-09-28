---
description: 扫描并优化文档 SEO — Meta 标签、可读性、关键词、失效链接、站点地图。
---

对文档文件运行 SEO 审计器。目标路径：`$ARGUMENTS`（默认：所有 docs/ 和根目录 README.md）。

若 `$ARGUMENTS` 为 `--report-only`，则只扫描不做修改。

执行全部 7 个阶段。自动修复非破坏性问题。绝不更改 URL。保留高排名页面的内容。

## 阶段 1：发现

找出所有目标 markdown 文件：
- `docs/**/*.md` — 所有文档页面
- 各领域根目录中的 `README.md` 文件
- 若 `$ARGUMENTS` 指定了路径，则只限定于该路径

对每个文件提取当前状态：`title:` frontmatter、`description:` frontmatter、H1、H2、字数、链接数。存为报告基线。

识别最近变更的文件： `git log --oneline -2 --name-only -- docs/ README.md`

## 阶段 2：Meta 标签

对每个带 YAML frontmatter 的文件：

**标题**（`title:` 字段）：
- 必须为 50-60 个字符
- 必须包含主关键词
- 在所有页面中必须唯一
- 使用领域上下文自动修复泛化标题

**描述**（`description:` 字段）：
- 必须为 120-160 个字符
- 必须包含主关键词
- 必须唯一 — 不得重复
- 从 SKILL.md frontmatter 或首段自动修复

对构建后的 HTML 页面运行 SEO 检查器：
```bash
python3 marketing-skill/seo-audit/scripts/seo_checker.py --file site/{path}/index.html
```

## 阶段 3：内容质量

**标题结构：** 每页一个 H1，不跳级，关键词出现在标题中。

**可读性：** 运行内容评分器：
```bash
python3 marketing-skill/content-production/scripts/content_scorer.py {file}
```
目标：可读性 ≥ 70，结构 ≥ 60。

**AI 痕迹检测**（仅针对非生成文件）：
```bash
python3 marketing-skill/content-humanizer/scripts/humanizer_scorer.py {file}
```
标记低于 50 的页面。修复 AI 陈词滥调："delve"、"leverage"、"it's important to note"、"comprehensive"。

**不要重写**排名良好的页面 —— 只修复其中的关键问题。

## 阶段 4：关键词

检查每个页面的主关键词是否出现在：title、description、H1、首段、至少一个 H2 中。

关键词密度：主关键词 1-2%。若超过 3% 则标记并降低。

**绝不更改既有 URL。** 只优化内容与 meta 标签。

## 阶段 5：链接

**内部链接：** 校验所有 `[text](url)` 目标是否存在。修复失效链接。

**重复内容：**
```bash
grep -rh '^description:' docs/**/*.md | sort | uniq -d
```
让每个重复项变得唯一。

**孤儿页面：** 找出不在 `mkdocs.yml` nav 中的页面。把它们加入导航。

## 阶段 6：站点地图

重新构建站点以重新生成站点地图：
```bash
mkdocs build
```

分析站点地图：
```bash
python3 marketing-skill/site-architecture/scripts/sitemap_analyzer.py site/sitemap.xml
```

校验所有页面都已出现，无重复项，无失效 URL。

## 阶段 7：报告

给出汇总，展示：已扫描页面数、发现的问题数、已应用的自动修复数、需人工复核项、已修复的失效链接数、已解决的孤儿页面数、站点地图 URL 数。列出未做修改的保留页面。
