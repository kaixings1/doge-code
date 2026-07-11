---
name: AE0营销
description: "/cs:aeo — 回答引擎优化工作流。审计内容的 E-E-A-T + 结构信号以驱动 LLM 引用（ChatGPT/Perplexity/Claude/Gemini/Mistral）。在 3 种模式下优化（保守/平衡/激进）。通过本地账本追踪哪些 LLM 引用了哪些页面。包含 8 个行业的行业感知阈值（含 YMYL 校准）。与 SEO 有区别。"
---

# /cs:aeo — 回答引擎优化

**命令：** `/cs:aeo [action] [args]`

`cs-aeo` 命令是 **AEO 工作流的入口点**：审计 → 优化 → 发布 → 追踪引用。

## 与 `/cs:seo-audit` 的区别

两者共享相同的基础（E-E-A-T），但为不同的转化事件进行优化：

- **`/cs:seo-audit`** — 为 Google/Bing 搜索结果中的排名和点击率优化
- **`/cs:aeo`**（此命令）— 为被 LLM 引用为权威来源而优化

它们可以在同一内容上运行。cs-aeo 智能体将展示这一点，并建议对高杠杆页面同时运行两者。

## 何时运行

- 审计现有内容的 AI 搜索就绪度（E-E-A-T + 结构信号）
- 在发布前优化页面以获得 LLM 引用
- 追踪哪些 LLM 随时间引用了哪些页面（引用账本）
- 研究 AEO 投资对特定内容是否值得
- 对照竞争对手的引用率进行基准测试

## 何时不运行

- 纯点击 SEO 无 AI 引用意图 → 使用 `/cs:seo-audit`
- 无事实依据的品牌语态内容（引用需要事实）
- 时效性新闻（LLM 训练延迟意味着引用在数月后才出现）
- LLM 已有强训练的领域（例如基础数学）

## 操作

### `audit` — 对内容进行 AEO 就绪度评分

```bash
/cs:aeo audit --input post.md --industry saas
/cs:aeo audit --url https://example.com/blog/post --industry healthcare
/cs:aeo audit --sample
```

返回综合评分 0-100，带有每个维度的细分（E-E-A-T + 结构）和按优先级排序的前 5 个修复项。

### `optimize` — 生成 AEO 改进版本

```bash
/cs:aeo optimize --input post.md --mode balanced --output post-aeo.md
/cs:aeo optimize --input post.md --mode aggressive --industry finance
```

三种模式：
- `conservative` — 修改 <10% 的文字（仅 schema + 更正页脚）
- `balanced` — 修改 <30%（引用标记 + 标题重构 + schema + 页脚）
- `aggressive` — 完全重构 + 事实优先开头 + 最大引用密度

### `track` — 记录你在 LLM 响应中观察到的引用

```bash
/cs:aeo track --url https://example.com/post --llm perplexity --query "what is AEO" --date 2026-05-17
```

维护位于 `~/.aeo-data/citations.json` 的本地账本。无遥测。

### `report` — 某个 URL 的聚合引用报告

```bash
/cs:aeo report --url https://example.com/post
```

返回总引用数、LLM 覆盖范围、速度、热门查询、判定（早期 / 新兴 / 强势）。

### `export` — 将引用账本导出为 CSV

```bash
/cs:aeo export --output citations.csv
```

用于向客户/利益相关者报告。

## 最低信息收集（3 个问题）

| 问题 | 询问内容 | 何时 |
|---|---|---|
| Q1 | 什么操作 — audit / optimize / track / report？ | 始终 |
| Q2 | 行业（saas / healthcare / finance / legal / ecommerce / b2b / media / education） | 始终（校准阈值） |
| Q3 | 对于 `optimize`：模式（conservative / balanced / aggressive）？ | 仅当操作=optimize 时 |

大多数调用在 Q2 后退出信息收集。

## 工作流

```bash
# 阶段 1：审计
python3 marketing-skill/skills/aeo/scripts/aeo_audit.py --input <file> --industry <industry>
# → 综合评分 0-100 + 前 N 修复

# 阶段 2：优化（如果审计 < 行业阈值）
python3 marketing-skill/skills/aeo/scripts/aeo_optimizer.py \
  --input <file> --mode <mode> --industry <industry> --output <file>-aeo.md
# → 优化版本 + 变更日志

# 阶段 3：发布（手动步骤——审查优化版本，然后部署）

# 阶段 4：追踪（4-12 周内）
python3 marketing-skill/skills/aeo/scripts/citation_tracker.py \
  --action add --url <url> --llm <llm> --query <query> --date <YYYY-MM-DD>
# → 账本已更新

# 阶段 5：报告（每月）
python3 marketing-skill/skills/aeo/scripts/citation_tracker.py \
  --action report --url <url>
# → 每个 URL 的引用报告
```

## 行业特定阈值

审计器按行业校准。YMYL（"Your Money or Your Life"）主题使用更严格的阈值：

| 行业 | 最低综合评分 | 原因 |
|---|---|---|
| 医疗保健 | 85 | 直接影响健康 |
| 金融 | 85 | 真实的财务决策 |
| 法律 | 85 | 误用可能导致法律风险 |
| 教育 | 75 | 学习成果 |
| SaaS、B2B、媒体 | 70 | 业务决策，中等风险 |
| 电子商务 | 65 | 产品评论，较低的个体风险 |

低于阈值的 YMYL 主题内容无论其他信号如何都不太可能被引用——cs-aeo 智能体将标记这一点，并在基础维度改进之前拒绝激进优化。

## 被拒绝的反模式

- 未经人工审查的 LLM 生成的 AEO 内容（RAG 检索降低通用 LLM 输出的优先级）
- 作者署名中伪造的资历（LLM 通过 LinkedIn/Wikipedia 交叉引用）
- Schema 垃圾信息（虚假的结构化数据标记会被过滤）
- 权威洗白（外部链接不赋予权威性）
- 针对单一 LLM 优化的隧道视野（73% 的跨 LLM 引用相关性——为共享信号优化）
- 以牺牲 SEO 为代价优化 AEO（反之亦然）——它们互补而非替代

## 触发短语

- "AEO 审计"
- "为 ChatGPT / Perplexity / Claude / Gemini 优化"
- "被 LLM 引用"
- "LLM 引用策略"
- "回答引擎优化"
- "E-E-A-T 审计"
- "AI 搜索内容"
- "追踪 AI 引用"
- "AI schema"

## Related

- Agent: [`cs-aeo`](agents/marketing/cs-aeo.md)
- Skill: [`aeo`](marketing-skill/skills/aeo/SKILL.md)
- Companion: `/cs:seo-audit` (SEO + AEO often run together)
- Source: ported from [`alirezarezvani/aeo-box`](https://github.com/alirezarezvani/aeo-box)

---

**Version:** 2.7.3
**License:** MIT
