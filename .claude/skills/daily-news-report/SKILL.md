---
name: 基于预设 URL 列表抓取内容，筛选高质量技术信息，并生成每日 Markdown 报告。
description: "基于预设 URL 列表抓取内容，筛选高质量技术信息，并生成每日 Markdown 报告。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 每日新闻报告 v3.0

> **架构升级**: 主代理编排 + 子代理执行 + 浏览器抓取 + 智能缓存

## 核心架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Main Agent (Orchestrator)                    │
│  Role: Scheduling, Monitoring, Evaluation, Decision, Aggregation    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│   │ 1. Init     │ → │ 2. Dispatch │ → │ 3. Monitor  │ → │ 4. Evaluate │     │
│   │ Read Config │    │ Assign Tasks│    │ Collect Res │    │ 过滤器/Sort │     │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                  │                  │           │
│         ▼                  ▼                  ▼                  ▼           │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│   │ 5. Decision │ ← │ Enough 20?  │    │ 6. Generate │ → │ 7. Update   │     │
│   │ Cont/Stop   │    │ Y/N         │    │ Report File │    │ Cache Stats │     │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
         ↓ Dispatch                          ↑ Return Results
┌─────────────────────────────────────────────────────────────────────┐
│                        SubAgent Execution Layer                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │ Worker A    │   │ Worker B    │   │ Browser     │              │
│   │ (WebFetch)  │   │ (WebFetch)  │   │ (Headless)  │              │
│   │ Tier1 Batch │   │ Tier2 Batch │   │ JS Render   │              │
│   └─────────────┘   └─────────────┘   └─────────────┘              │
│         ↓                 ↓                 ↓                        │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Structured Result Return                 │   │
│   │  { status, data: [...], errors: [...], metadata: {...} }    │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 配置文件

此技能使用以下配置文件：

| 文件 | 用途 |
|------|---------|
| `sources.json` | 源配置、优先级、抓取方法 |
| `cache.json` | 缓存数据、历史统计、去重指纹 |

## 执行过程详情

### 阶段 1: 初始化

```yaml
Steps:
  1. Determine date (user 参数 or current date)
  2. Read sources.json for source configurations
  3. Read cache.json for historical data
  4. Create output directory NewsReport/
  5. Check if a partial report exists for today (append mode)
```

### 阶段 2: 分派子代理

**策略**: 并行分派、批量执行、提前停止机制

```yaml
Wave 1 (Parallel):
  - Worker A: Tier1 Batch A (HN, HuggingFace Papers)
  - Worker B: Tier1 Batch B (OneUsefulThing, Paul Graham)

Wait for results → Evaluate count

If < 15 high-quality items:
  Wave 2 (Parallel):
    - Worker C: Tier2 Batch A (James Clear, FS Blog)
    - Worker D: Tier2 Batch B (HackerNoon, Scott Young)

If still < 20 items:
  Wave 3 (Browser):
    - Browser Worker: ProductHunt, Latent Space (Require JS rendering)
```

### 阶段 3: 子代理任务格式

每个子代理接收的任务格式：

```yaml
task: fetch_and_extract
sources:
  - id: hn
    url: https://news.ycombinator.com
    extract: top_10
  - id: hf_papers
    url: https://huggingface.co/papers
    extract: top_voted

output_schema:
  items:
    - source_id: string      # Source Identifier
      title: string          # Title
      summary: string        # 2-4 sentence summary
      key_points: string[]   # Max 3 key points
      url: string            # Original URL
      keywords: string[]     # Keywords
      quality_score: 1-5     # Quality Score

constraints:
  过滤器: "Cutting-edge Tech/Deep Tech/Productivity/Practical Info"
  exclude: "General Science/Marketing Puff/Overly Academic/Job Posts"
  max_items_per_source: 10
  skip_on_error: true

return_format: JSON
```

### 阶段 4: 主代理监控与反馈

主代理职责：

```yaml
Monitoring:
  - Check SubAgent return status (success/partial/failed)
  - Count collected items
  - Record success rate per source

Feedback Loop:
  - If a SubAgent fails, decide whether to retry or skip
  - If a source fails persistently, mark as disabled
  - Dynamically adjust source selection for subsequent batches

Decision:
  - Items >= 25 AND HighQuality >= 20 → Stop scraping
  - Items < 15 → Continue to next batch
  - All batches done but < 20 → Generate with available content (Quality over Quantity)
```

### 阶段 5: 评估与过滤

```yaml
Deduplication:
  - Exact URL match
  - Title similarity (>80% considered duplicate)
  - Check cache.json to avoid history duplicates

Score Calibration:
  - Unify scoring standards across SubAgents
  - Adjust weights based on source credibility
  - Bonus points for manually curated high-quality sources

Sorting:
  - Descending order by quality_score
  - Sort by source priority if scores are equal
  - Take Top 20
```

### 阶段 6: 浏览器抓取 (MCP Chrome DevTools)

对于需要 JS 渲染的页面，使用无头浏览器：

```yaml
Process:
  1. Call mcp__chrome-devtools__new_page to open page
  2. Call mcp__chrome-devtools__wait_for to wait for content load
  3. Call mcp__chrome-devtools__take_snapshot to get page structure
  4. Parse snapshot to extract required content
  5. Call mcp__chrome-devtools__close_page to close page

Applicable Scenarios:
  - ProductHunt (403 on WebFetch)
  - Latent Space (Substack JS rendering)
  - Other SPA applications
```

### 阶段 7: 生成报告

```yaml
Output:
  - Directory: NewsReport/
  - Filename: YYYY-MM-DD-news-report.md
  - Format: Standard Markdown

Content Structure:
  - Title + Date
  - Statistical Summary (Source count, items collected)
  - 20 High-Quality Items (Template based)
  - Generation Info (Version, Timestamps)
```

### 阶段 8: 更新缓存

```yaml
Update cache.json:
  - last_run: Record this run info
  - source_stats: Update stats per source
  - url_cache: Add processed URLs
  - content_hashes: Add content fingerprints
  - article_history: Record included articles
```

## 子代理调用示例

### 使用通用代理

由于自定义代理需要重新启动会话才能被发现，使用通用代理并注入工作提示：

```
Task Call:
  subagent_type: general-目的
  model: haiku
  prompt: |
    You are a stateless execution unit. Only do the assigned task and return structured JSON.

    Task: Scrape the following URLs and extract content

    URLs:
    - https://news.ycombinator.com (Extract Top 10)
    - https://huggingface.co/papers (Extract top voted papers)

    Output Format:
    {
      "status": "success" | "partial" | "failed",
      "data": [
        {
          "source_id": "hn",
          "title": "...",
          "summary": "...",
          "key_points": ["...", "...", "..."],
          "url": "...",
          "keywords": ["...", "..."],
          "quality_score": 4
        }
      ],
      "errors": [],
      "metadata": { "processed": 2, "failed": 0 }
    }

    过滤器 Criteria:
    - Keep: Cutting-edge Tech/Deep Tech/Productivity/Practical Info
    - Exclude: General Science/Marketing Puff/Overly Academic/Job Posts

    Return JSON directly, no explanation.
```

### 使用工作代理 (需要会话重启)

```
Task Call:
  subagent_type: worker
  prompt: |
    task: fetch_and_extract
    input:
      urls:
        - https://news.ycombinator.com
        - https://huggingface.co/papers
    output_schema:
      - source_id: string
      - title: string
      - summary: string
      - key_points: string[]
      - url: string
      - keywords: string[]
      - quality_score: 1-5
    constraints:
      过滤器: Cutting-edge Tech/Deep Tech/Productivity/Practical Info
      exclude: General Science/Marketing Puff/Overly Academic
```

## 输出模板

```markdown
# Daily News Report (YYYY-MM-DD)

> Curated from N sources today, containing 20 high-quality items
> Generation Time: X min | Version: v3.0
>
> **Warning**: Sub-agent 'worker' not detected. Running in generic mode (Serial Execution). Performance might be degraded.

---

## 1. Title

- **Summary**: 2-4 lines 概述
- **Key Points**:
  1. Point one
  2. Point two
  3. Point three
- **Source**: Link
- **Keywords**: `keyword1` `keyword2` `keyword3`
- **Score**: ⭐⭐⭐⭐⭐ (5/5)

---

## 2. Title
...

---

*Generated by Daily News Report v3.0*
*Sources: HN, HuggingFace, OneUsefulThing, ...*
```

## 约束条件与原则

1.  **质量优先于数量**: 低质量内容不进入报告。
2.  **提前停止**: 一旦达到 20 个高质量项目就停止抓取。
3.  **并行优先**: 同一批次的子代理并行执行。
4.  **容错性**: 单个源失败不影响整个流程。
5.  **缓存重用**: 避免重新抓取相同内容。
6.  **主代理控制**: 所有决策由主代理做出。
7.  **降级感知**: 检测子代理可用性，如果不可用则优雅降级。

## 预期性能

| 场景 | 预期时间 | 备注 |
|---|---|---|
| 最优 | ~2 分钟 | Tier1 足够，无需浏览器 |
| 正常 | ~3-4 分钟 | 需要 Tier2 补充 |
| 需要浏览器 | ~5-6 分钟 | 包括 JS 渲染页面 |

## 错误处理

| 错误类型 | 处理方式 |
|---|---|
| 子代理超时 | 记录错误，继续下一个 |
| 源 403/404 | 标记为禁用，更新 sources.json |
| 提取失败 | 返回原始内容，由主代理决定 |
| 浏览器崩溃 | 跳过源，记录日志 |

## 兼容性与降级

为确保在不同代理环境中的可用性，必须执行以下检查：

1.  **环境检查**:
    -   在阶段 1 初始化时，尝试检测 `worker` 子代理是否存在。
    -   如果不存在（或插件未安装），自动切换到**串行执行模式**。

2.  **串行执行模式**:
    -   不使用并行块。
    -   主代理按顺序为每个源执行抓取任务。
    -   较慢，但保证基本功能。

3.  **用户警报**:
    -   必须在生成的报告标题中包含明确的警告，指示当前降级模式。

## 使用场景
此技能适用于执行概述中描述的工作流或操作。
